const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    RoleSelectMenuBuilder,
    ChannelType
} = require('discord.js');
const express = require('express');
const path = require('path');

// --- 1. CONFIGURATION DU SERVEUR WEB (EXPRESS) ---
const app = express();
const port = process.env.PORT || 10000;

const commandLogs = [];
const visitorLogs = [];

function logCommand(user, command) {
    const time = new Date().toLocaleTimeString('fr-FR', { 
        timeZone: 'Europe/Paris', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    commandLogs.unshift({ time, user, command });
    if (commandLogs.length > 10) commandLogs.pop();
}

app.use((req, res, next) => {
    if (req.url === '/' || req.url === '/index.html') {
        const userAgent = req.headers['user-agent'] || '';
        const time = new Date().toLocaleTimeString('fr-FR', { 
            timeZone: 'Europe/Paris', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        const botKeywords = ['bot', 'spider', 'crawler', 'cron-job', 'uptimerobot', 'axios', 'fetch'];
        const isBot = botKeywords.some(keyword => userAgent.toLowerCase().includes(keyword));
        const visitorType = isBot ? '🤖 BOT / SCRIPT' : '👤 HUMAIN';

        visitorLogs.unshift({ time, type: visitorType, device: userAgent });
        if (visitorLogs.length > 10) visitorLogs.pop();
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/logs', (req, res) => {
    res.json({ commands: commandLogs, visitors: visitorLogs });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`🚀 Serveur web actif sur le port ${port}`));


// --- 2. CONFIGURATION DU BOT DISCORD (SEIMI) ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates 
    ]
});

const serverConfig = {
    prefix: "!",
    welcomeRole: "Arrivant",
    codesChannelId: "1514658424791502848", 
    
    // Configuration Douane
    waitingVoiceId: "1468303822731612348", 
    privateVoiceId: "1498498611275895005", 
    adminTextId: "1515043230960324800",

    // Configuration Tickets (ID mis à jour avec le tien)
    ticketCategoryId: "1463929005395808329" 
};

client.on('ready', () => {
    console.log(`🤖 Bot Discord connecté : ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
    const roleNameOrId = serverConfig.welcomeRole; 
    const role = member.guild.roles.cache.get(roleNameOrId) || member.guild.roles.cache.find(r => r.name === roleNameOrId);
    if (!role) return;
    try { await member.roles.add(role); } catch (err) { console.error("Erreur rôle auto:", err); }
});

// GESTION DES INTERACTIONS (BOUTONS / MENUS)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isRoleSelectMenu()) return;

    // --- INTERACTION : BOUTON CODES ROBLOX ---
    if (interaction.customId === 'btn_get_codes') {
        const codesEmbed = {
            color: 0x00E676,
            title: '🎮 CODES DE RÉCOMPENSE ROBLOX',
            description: `Bonjour ${interaction.user}, voici l'espace des codes actifs !`,
            fields: [
                { name: '📌 Codes Actifs', value: '❌ *Aucun code promotionnel n\'est disponible pour le moment.*' },
                { name: '💡 Info', value: 'Reviens régulièrement ! Les nouveaux codes s\'afficheront ici dès qu\'ils sortiront.' }
            ],
            footer: { text: '🔒 Ce message n\'est visible que par vous' },
            timestamp: new Date()
        };
        return interaction.reply({ embeds: [codesEmbed], ephemeral: true });
    }

    // --- INTERACTION : CLIQUE SUR OUVRIR UN TICKET 📨 ---
    if (interaction.customId === 'btn_open_ticket') {
        const guild = interaction.guild;
        const member = interaction.member;

        // Évite qu'un utilisateur ouvre plusieurs tickets en même temps
        const existingChannel = guild.channels.cache.find(c => c.name === `📩-ticket-${member.user.username.toLowerCase()}`);
        if (existingChannel) {
            return interaction.reply({ content: `⚠️ Tu as déjà un ticket ouvert ici : ${existingChannel}`, ephemeral: true });
        }

        await interaction.reply({ content: "⏳ Création de ton ticket en cours...", ephemeral: true });

        try {
            const ticketChannel = await guild.channels.create({
                name: `📩-ticket-${member.user.username}`,
                type: ChannelType.GuildText,
                parent: serverConfig.ticketCategoryId || null,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    }
                ],
            });

            const welcomeTicketEmbed = {
                color: 0x9B5DE5,
                title: '📨 ASSISTANCE - SEIMI BOT',
                description: `Bonjour ${member},\n\nMerci d'avoir contacté le support. Décris précisément ta demande ou ton problème ci-dessous. Un membre de l'équipe va te prendre en charge rapidement.`,
                footer: { text: 'Pour fermer ce ticket, cliquez sur le bouton ci-dessous.' },
                timestamp: new Date()
            };

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            await ticketChannel.send({ content: `👋 ${member} | <@&1463629608518815804>`, embeds: [welcomeTicketEmbed], components: [closeRow] });
            return interaction.editReply({ content: `✅ Ton ticket a été créé avec succès : ${ticketChannel}` });

        } catch (err) {
            console.error(err);
            return interaction.editReply({ content: "❌ Une erreur est survenue lors de la création du ticket." });
        }
    }

    // --- INTERACTION : FERMETURE DU TICKET 🔒 ---
    if (interaction.customId === 'btn_close_ticket') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({ content: "❌ Seul un membre du personnel peut clore ce ticket.", ephemeral: true });
        }

        await interaction.reply({ content: "🔒 Fermeture et nettoyage du salon dans 5 secondes..." });
        setTimeout(async () => {
            try { await interaction.channel.delete(); } catch(e) {}
        }, 5000);
        return;
    }

    // --- INTERACTIONS SYSTEME DOUANE VOCALE ---
    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const userId = parts[1];
        const originChannelId = parts[2];
        
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        const originChannel = guild.channels.cache.get(originChannelId);

        if (!member) return interaction.reply({ content: "❌ Le joueur n'est plus là.", ephemeral: true });

        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) {
                if (originChannel) originChannel.send(`⚠️ ${member}, transfert accepté mais tu as quitté l'attente !`).then(m => setTimeout(() => m.delete(), 6000));
                return interaction.update({ content: `❌ Absent du salon vocal d'attente.`, embeds: [], components: [] });
            }
            try {
                await member.voice.setChannel(serverConfig.privateVoiceId);
                if (originChannel) originChannel.send(`✅ ${member}, ta demande a été acceptée !`).then(m => setTimeout(() => m.delete(), 6000));
                return interaction.update({ content: `🟢 Demande acceptée pour **${member.user.tag}**.`, embeds: [], components: [] });
            } catch (err) { return interaction.reply({ content: "❌ Déplacement impossible.", ephemeral: true }); }
        }

        if (action === 'md') {
            if (originChannel) originChannel.send(`❌ ${member}, demande d'accès refusée.`).then(m => setTimeout(() => m.delete(), 6000));
            return interaction.update({ content: `🔴 Demande refusée pour **${member.user.tag}**.`, embeds: [], components: [] });
        }
    }

    if (interaction.customId === 'cfg_role_select') {
        serverConfig.welcomeRole = interaction.values[0];
        return interaction.update({ content: `✅ Rôle de bienvenue mis à jour !`, components: [] });
    }
});

// LISTENER MESSAGES & COMMANDES
client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;
    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    logCommand(message.author.tag, currentPrefix + command + (args.length ? ' ' + args.join(' ') : ''));

    // --- COMMANDE : !SETUPTICKET ---
    if (command === 'setupticket') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

        const ticketSetupEmbed = {
            color: 0x9B5DE5,
            title: '📩 ASSISTANCE & SUPPORT TECHNIQUE',
            description: 'Besoin d\'aide, d\'un renseignement ou de signaler un problème ?\n\nCliquez sur le bouton ci-dessous pour ouvrir un salon de discussion privé avec l\'équipe administrative. Soyez clairs dans vos explications.',
            footer: { text: 'Système d\'aide automatisé Seimi' }
        };

        const ticketRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('Ouvrir un Ticket').setStyle(ButtonStyle.Primary).setEmoji('📨')
        );

        return message.channel.send({ embeds: [ticketSetupEmbed], components: [ticketRow] });
    }

    // --- COMMANDE : !MOOV ---
    if (command === 'moov') {
        try { await message.delete(); } catch (err) {}
        const voiceState = message.member.voice;

        if (!voiceState.channel || voiceState.channel.id !== serverConfig.waitingVoiceId) {
            return message.channel.send(`⚠️ **${message.author}**, tu dois être dans le salon vocal d'attente <#${serverConfig.waitingVoiceId}>.`)
                .then(m => setTimeout(() => m.delete(), 6000));
        }

        message.channel.send(`⏳ **${message.author}**, ton niveau d'accès est en cours de vérification.`)
            .then(m => setTimeout(() => m.delete(), 6000));

        const adminTextChannel = message.guild.channels.cache.get(serverConfig.adminTextId);
        if (!adminTextChannel) return;

        const requestEmbed = {
            color: 0xFFA000,
            title: '📥 DEMANDE DE TRANSFERT VOCAL',
            description: `Le joueur **${message.author.tag}** demande la permission de te rejoindre.`,
            fields: [
                { name: '👤 Utilisateur', value: `${message.author}`, inline: true },
                { name: '🔊 Salon actuel', value: `<#${serverConfig.waitingVoiceId}>`, inline: true }
            ],
            timestamp: new Date()
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ma_${message.author.id}_${message.channel.id}`).setLabel('Accepter').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId(`md_${message.author.id}_${message.channel.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('🔴')
        );

        return adminTextChannel.send({ content: `🔔 **Nouvelle demande reçue !**`, embeds: [requestEmbed], components: [row] });
    }

    // --- COMMANDE : !SETUPCODES ---
    if (command === 'setupcodes') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

        const setupEmbed = {
            color: 0x00E676,
            title: '🎁 ESPACE DES CODES ROBLOX',
            description: 'Bienvenue dans l\'espace de récupération des récompenses !\n\nClique sur le bouton vert ci-dessous pour afficher les codes cadeaux actifs du moment.',
            footer: { text: 'Seimi Bot Système' }
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_get_codes').setLabel('Récupérer les codes').setStyle(ButtonStyle.Success).setEmoji('🎮')
        );
        return message.channel.send({ embeds: [setupEmbed], components: [row] });
    }

    // --- COMMANDE : !CONFIG ---
    if (command === 'config') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

        const getRoleDisplay = () => {
            const role = message.guild.roles.cache.get(serverConfig.welcomeRole);
            return role ? `<@&${role.id}>` : `\`${serverConfig.welcomeRole}\``;
        };

        const generateConfigEmbed = () => {
            return {
                color: 0x5865F2,
                title: '⚙️ PANNEAU DE CONFIGURATION - SEIMI',
                fields: [
                    { name: '📌 Préfixe Actuel', value: `\`${serverConfig.prefix}\``, inline: true },
                    { name: '👋 Rôle d\'Arrivée', value: getRoleDisplay(), inline: true }
                ],
                footer: { text: 'Session active pendant 1 minute' },
                timestamp: new Date()
            };
        };

        const mainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cfg_prefix').setLabel('Modifier le Préfixe').setStyle(ButtonStyle.Primary).setEmoji('📌'),
            new ButtonBuilder().setCustomId('cfg_role_btn').setLabel('Modifier le Rôle').setStyle(ButtonStyle.Success).setEmoji('👋'),
            new ButtonBuilder().setCustomId('cfg_staff_help').setLabel('Modération').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('cfg_close').setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        const panelMessage = await message.channel.send({ embeds: [generateConfigEmbed()], components: [mainRow] });
        const collector = panelMessage.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) return interaction.reply({ content: "❌ Ce n'est pas ton panneau.", ephemeral: true });
            
            if (interaction.customId === 'cfg_close') {
                collector.stop();
                try { await panelMessage.delete(); } catch (err) {}
                return;
            }
            if (interaction.customId === 'cfg_staff_help') {
                const staffEmbed = {
                    color: 0x0099ff,
                    title: '🛠️ GUIDE DE MODÉRATION COMPLET',
                    fields: [
                        { name: `🧹 ${serverConfig.prefix}clear [1-100]`, value: 'Supprime les messages.' },
                        { name: `🤐 ${serverConfig.prefix}mute @membre [temps]`, value: 'Exclut un utilisateur.' },
                        { name: `🚫 ${serverConfig.prefix}ban @membre`, value: 'Bannit définitivement.' },
                        { name: `🎁 ${serverConfig.prefix}setupcodes`, value: 'Bouton des codes.' },
                        { name: `📨 ${serverConfig.prefix}setupticket`, value: 'Installe le panneau de tickets d\'aide.' }
                    ],
                    footer: { text: 'Guide privé.' },
                    timestamp: new Date()
                };
                return interaction.reply({ embeds: [staffEmbed], ephemeral: true });
            }
            if (interaction.customId === 'cfg_prefix') {
                await interaction.update({ content: '✍️ **Entre le nouveau préfixe :**', embeds: [], components: [] });
                const msgCollector = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, max: 1, time: 30000 });
                msgCollector.on('collect', async (m) => {
                    serverConfig.prefix = m.content.trim().split(/ +/)[0];
                    try { await m.delete(); } catch(e){}
                    await panelMessage.edit({ content: `✅ Préfixe mis à jour !`, embeds: [generateConfigEmbed()], components: [mainRow] });
                });
            }
            if (interaction.customId === 'cfg_role_btn') {
                const roleMenuRow = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_role_select').setPlaceholder('Sélectionne un rôle...').setMaxValues(1));
                await interaction.update({ content: '👋 **Étape 2 : Choisis le rôle d\'arrivée :**', embeds: [], components: [roleMenuRow] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') { try { await panelMessage.delete(); } catch (err) {} }
        });
        return;
    }

    // --- COMMANDE : !MUTE ---
    if (command === 'mute') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const member = message.mentions.members.first();
        const duration = args[1];
        if (!member) return message.reply("Mentionnez un membre.").then(m => setTimeout(() => m.delete(), 5000));
        
        let time = 0;
        switch (duration) {
            case '1m': time = 60 * 1000; break;
            case '5m': time = 5 * 60 * 1000; break;
            case '10m': time = 10 * 60 * 1000; break;
            case '30m': time = 30 * 60 * 1000; break;
            case '1h': time = 60 * 60 * 1000; break;
            default: return message.reply("Durée invalide.").then(m => setTimeout(() => m.delete(), 5000));
        }
        try {
            await member.timeout(time, "Mute via Seimi");
            message.channel.send(`🤐 **${member.user.tag}** exclu pour **${duration}**.`).then(m => setTimeout(() => m.delete(), 5000));
        } catch (err) {}
    }

    // --- COMMANDE : !CLEAR ---
    if (command === 'clear') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Chiffre entre 1 et 100.").then(m => setTimeout(() => m.delete(), 5000));
        try {
            await message.channel.bulkDelete(amount, true);
            message.channel.send("✅ Suppression effectuée.").then(m => setTimeout(() => m.delete(), 3000));
        } catch (err) {}
    }

    // --- COMMANDE : !BAN ---
    if (command === 'ban') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        const member = message.mentions.members.first();
        if (!member || member.id === message.author.id || !member.bannable) return;

        const confirmMsg = await message.channel.send(`⚠️ Confirmer le bannissement de **${member.user.tag}** ? (oui/non)`);
        const filter = m => m.author.id === message.author.id && ['oui', 'non'].includes(m.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000 });
            const responseMessage = collected.first();
            try { await responseMessage.delete(); } catch(e){}
            
            if (responseMessage.content.toLowerCase() === 'oui') {
                await member.ban();
                message.channel.send(`🚫 **${member.user.tag}** banni.`).then(m => setTimeout(() => m.delete(), 5000));
            } else { message.channel.send("Bannissement annulé.").then(m => setTimeout(() => m.delete(), 5000)); }
            try { await confirmMsg.delete(); } catch(e){}
        } catch (err) { try { await confirmMsg.delete(); } catch(e){} }
    }
});

client.login(process.env.TOKEN);
