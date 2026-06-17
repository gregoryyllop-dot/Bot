const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    RoleSelectMenuBuilder 
} = require('discord.js');
const express = require('express');
const path = require('path');

// --- 1. CONFIGURATION DU SERVEUR WEB (EXPRESS) ---
const app = express();
const port = process.env.PORT || 10000;

// Tableaux de stockage temporaire en mémoire pour le site web
const commandLogs = [];
const visitorLogs = [];

// Fonction pour enregistrer les commandes Discord avec l'heure de Paris
function logCommand(user, command) {
    const time = new Date().toLocaleTimeString('fr-FR', { 
        timeZone: 'Europe/Paris', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    commandLogs.unshift({ time, user, command });
    if (commandLogs.length > 10) commandLogs.pop(); // Garde les 10 dernières
}

// Middleware pour détecter les visiteurs (Humains vs Bots de ping)
app.use((req, res, next) => {
    if (req.url === '/' || req.url === '/index.html') {
        const userAgent = req.headers['user-agent'] || '';
        
        // Correction de l'heure : Force le fuseau horaire de Paris
        const time = new Date().toLocaleTimeString('fr-FR', { 
            timeZone: 'Europe/Paris', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Mots-clés pour repérer les systèmes de ping automatiques
        const botKeywords = ['bot', 'spider', 'crawler', 'cron-job', 'uptimerobot', 'axios', 'fetch'];
        const isBot = botKeywords.some(keyword => userAgent.toLowerCase().includes(keyword));
        
        const visitorType = isBot ? '🤖 BOT / SCRIPT' : '👤 HUMAIN';

        visitorLogs.unshift({ time, type: visitorType, device: userAgent });
        if (visitorLogs.length > 10) visitorLogs.pop(); // Garde les 10 dernières
    }
    next();
});

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Route API pour alimenter le panneau d'affichage du site web
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

// Paramètres de configuration du serveur
const serverConfig = {
    prefix: "!",
    welcomeRole: "Arrivant",
    codesChannelId: "1514658424791502848", 
    
    // Configuration du système de douane vocal (!moov)
    waitingVoiceId: "1468303822731612348", 
    privateVoiceId: "1498498611275895005", 
    adminTextId: "1515043230960324800"      
};

client.on('ready', () => {
    console.log(`🤖 Bot Discord connecté : ${client.user.tag}`);
});

// Attribution automatique du rôle aux nouveaux membres
client.on('guildMemberAdd', async (member) => {
    const roleNameOrId = serverConfig.welcomeRole; 
    const role = member.guild.roles.cache.get(roleNameOrId) || member.guild.roles.cache.find(r => r.name === roleNameOrId);

    if (!role) return;
    try { await member.roles.add(role); } catch (err) { console.error("Erreur rôle auto:", err); }
});

// Gestion des interactions (Boutons et Menus de sélection)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isRoleSelectMenu()) return;

    // Bouton de récupération des codes Roblox
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

    // Boutons du système de Douane (!moov)
    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const userId = parts[1];
        const originChannelId = parts[2];
        
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        const originChannel = guild.channels.cache.get(originChannelId);

        if (!member) {
            return interaction.reply({ content: "❌ Le joueur n'est plus présent sur le serveur.", ephemeral: true });
        }

        // Action : Accepter le transfert
        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) {
                if (originChannel) {
                    originChannel.send(`⚠️ ${member}, ton transfert a été accepté mais tu as quitté le salon vocal d'attente !`).then(m => setTimeout(() => m.delete(), 6000));
                }
                return interaction.update({ content: `❌ Demande acceptée mais **${member.user.tag}** n'est plus dans le vocal d'attente.`, embeds: [], components: [] });
            }

            try {
                await member.voice.setChannel(serverConfig.privateVoiceId);
                if (originChannel) {
                    originChannel.send(`✅ ${member}, ta demande a été acceptée ! Tu as été déplacé.`).then(m => setTimeout(() => m.delete(), 6000));
                }
                return interaction.update({ content: `🟢 Tu as **accepté** la demande de **${member.user.tag}**. Transfert réussi !`, embeds: [], components: [] });
            } catch (err) {
                return interaction.reply({ content: "❌ Impossible de déplacer le membre.", ephemeral: true });
            }
        }

        // Action : Refuser le transfert
        if (action === 'md') {
            if (originChannel) {
                originChannel.send(`❌ ${member}, désolé, ta demande d'accès au salon privé a été **refusée**.`).then(m => setTimeout(() => m.delete(), 6000));
            }
            return interaction.update({ content: `🔴 Tu as **refusé** la demande de **${member.user.tag}**.`, embeds: [], components: [] });
        }
    }

    // Sélecteur de rôle dans le panneau !config
    if (interaction.customId === 'cfg_role_select') {
        serverConfig.welcomeRole = interaction.values[0];
        // On régénère l'affichage mis à jour (déclenché via le menu de sélection de rôles)
        return interaction.update({ content: `✅ Rôle de bienvenue mis à jour !`, components: [] });
    }
});

// Écouteur de messages et exécution des commandes
client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;

    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Envoi immédiat de la commande vers les logs du site web
    logCommand(message.author.tag, currentPrefix + command + (args.length ? ' ' + args.join(' ') : ''));

    // --- COMMANDE : !MOOV ---
    if (command === 'moov') {
        try { await message.delete(); } catch (err) {}
        const voiceState = message.member.voice;

        if (!voiceState.channel || voiceState.channel.id !== serverConfig.waitingVoiceId) {
            return message.channel.send(`⚠️ **${message.author}**, tu dois être dans le salon vocal d'attente <#${serverConfig.waitingVoiceId}> pour utiliser cette commande.`)
                .then(m => setTimeout(() => m.delete(), 6000));
        }

        message.channel.send(`⏳ **${message.author}**, ton niveau d'accès est en cours de vérification. Patiente ici...`)
            .then(m => setTimeout(() => m.delete(), 6000));

        const adminTextChannel = message.guild.channels.cache.get(serverConfig.adminTextId);
        if (!adminTextChannel) return;

        const requestEmbed = {
            color: 0xFFA000,
            title: '📥 DEMANDE DE TRANSFERT VOCAL',
            description: `Le joueur **${message.author.tag}** demande la permission de te rejoindre dans ton salon privé.`,
            fields: [
                { name: '👤 Utilisateur', value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                { name: '🔊 Salon actuel', value: `<#${serverConfig.waitingVoiceId}>`, inline: true }
            ],
            timestamp: new Date(),
            footer: { text: 'Système de Douane Seimi' }
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ma_${message.author.id}_${message.channel.id}`).setLabel('Accepter').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId(`md_${message.author.id}_${message.channel.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('🔴')
        );

        return adminTextChannel.send({ content: `🔔 <@&1463629608518815804> **Nouvelle demande reçue !**`, embeds: [requestEmbed], components: [row] });
    }

    // --- COMMANDE : !SETUPCODES ---
    if (command === 'setupcodes') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;

        const setupEmbed = {
            color: 0x5865F2,
            title: '🎁 ESPACE DES CODES ROBLOX',
            description: 'Bienvenue dans l\'espace de récupération des récompenses !\n\nClique sur le bouton vert ci-dessous pour afficher les codes cadeaux actifs du moment. Le message s\'affichera uniquement pour toi.',
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
                        { name: `🧹 ${serverConfig.prefix}clear [1-100]`, value: 'Supprime les messages dans le salon.' },
                        { name: `🤐 ${serverConfig.prefix}mute @membre [temps]`, value: 'Exclut temporairement un utilisateur.' },
                        { name: `🚫 ${serverConfig.prefix}ban @membre`, value: 'Bannit définitivement.' },
                        { name: `🎁 ${serverConfig.prefix}setupcodes`, value: 'Installe le bouton des codes Roblox.' }
                    ],
                    footer: { text: '🔒 Ce guide n\'est visible que par toi.' },
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
        if (!member) return message.reply("Veuillez mentionner un membre.").then(m => setTimeout(() => m.delete(), 5000));
        
        let time = 0;
        switch (duration) {
            case '1m': time = 60 * 1000; break;
            case '5m': time = 5 * 60 * 1000; break;
            case '10m': time = 10 * 60 * 1000; break;
            case '30m': time = 30 * 60 * 1000; break;
            case '1h': time = 60 * 60 * 1000; break;
            default: return message.reply("Durée invalide (1m, 5m, 10m, 30m, 1h).").then(m => setTimeout(() => m.delete(), 5000));
        }
        try {
            await member.timeout(time, "Mute via commande Seimi");
            message.channel.send(`🤐 **${member.user.tag}** a été exclu pour **${duration}**.`).then(m => setTimeout(() => m.delete(), 5000));
        } catch (err) { message.reply("Erreur de permissions pour appliquer l'exclusion.").then(m => setTimeout(() => m.delete(), 5000)); }
    }

    // --- COMMANDE : !CLEAR ---
    if (command === 'clear') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Indiquez un chiffre entre 1 et 100.").then(m => setTimeout(() => m.delete(), 5000));
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
                message.channel.send(`🚫 **${member.user.tag}** banni définitivement.`).then(m => setTimeout(() => m.delete(), 5000));
            } else { message.channel.send("Bannissement annulé.").then(m => setTimeout(() => m.delete(), 5000)); }
            try { await confirmMsg.delete(); } catch(e){}
        } catch (err) { try { await confirmMsg.delete(); } catch(e){} }
    }
});

client.login(process.env.TOKEN);
