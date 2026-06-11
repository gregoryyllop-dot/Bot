const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType, 
    RoleSelectMenuBuilder 
} = require('discord.js');
const express = require('express');
const path = require('path');

// --- 1. CONFIGURATION DU SERVEUR ET SITE WEB POUR RENDER ---
const app = express();
const port = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`Serveur actif sur le port ${port}`));

// --- 2. CONFIGURATION DU BOT SEIMI ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- BASE DE DONNÉES TEMPORAIRE ---
const serverConfig = {
    prefix: "!",
    welcomeRole: "Arrivant",
    codesChannelId: "1514658424791502848" // Ton salon spécifique pour les codes
};

client.on('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
});

// --- ENREGISTREMENT D'UN NOUVEAU MEMBRE ---
client.on('guildMemberAdd', async (member) => {
    const roleNameOrId = serverConfig.welcomeRole; 
    const role = member.guild.roles.cache.get(roleNameOrId) || member.guild.roles.cache.find(r => r.name === roleNameOrId);

    if (!role) return;
    try { await member.roles.add(role); } catch (err) {}
});

// --- GESTION DES INTERACTIONS (BOUTONS) ---
client.on('interactionCreate', async (interaction) => {
    // Si ce n'est pas un bouton, on ignore
    if (!interaction.isButton()) return;

    // Gestion du bouton des CODES ROBLOX
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

        // ENVOI ÉPHÉMÈRE : Seul l'utilisateur voit ce message dans le salon !
        return interaction.reply({ embeds: [codesEmbed], ephemeral: true });
    }
});

// --- GESTION DES MESSAGES & COMMANDES ---
client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;

    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- COMMANDE : !SETUPCODES (Pour l'administrateur) ---
    // Tu tapes cette commande UNE SEULE FOIS dans ton salon secret pour mettre le bouton permanent
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
            new ButtonBuilder()
                .setCustomId('btn_get_codes')
                .setLabel('Récupérer les codes')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮')
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
                description: 'Clique sur les boutons ci-dessous pour configurer le système étape par étape.',
                fields: [
                    { name: '📌 Préfixe Actuel', value: `\`${serverConfig.prefix}\``, inline: true },
                    { name: '👋 Rôle d\'Arrivée', value: getRoleDisplay(), inline: true }
                ],
                footer: { text: 'Session active pendant 2 minutes' },
                timestamp: new Date()
            };
        };

        const mainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cfg_prefix').setLabel('Modifier le Préfixe').setStyle(ButtonStyle.Primary).setEmoji('📌'),
            new ButtonBuilder().setCustomId('cfg_role_btn').setLabel('Modifier le Rôle').setStyle(ButtonStyle.Success).setEmoji('👋'),
            new ButtonBuilder().setCustomId('cfg_staff_help').setLabel('Guide Modération').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('cfg_close').setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        const panelMessage = await message.channel.send({ embeds: [generateConfigEmbed()], components: [mainRow] });
        const collector = panelMessage.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) return interaction.reply({ content: "❌ Ce n'est pas ton panneau.", ephemeral: true });
            if (interaction.customId === 'cfg_close') {
                collector.stop();
                return interaction.update({ content: '🔒 Panneau fermé.', embeds: [], components: [] });
            }
            if (interaction.customId === 'cfg_staff_help') {
                const staffEmbed = {
                    color: 0x0099ff,
                    title: '🛠️ GUIDE MODÉRATION',
                    fields: [
                        { name: `🧹 ${serverConfig.prefix}clear [1-100]`, value: 'Nettoie le chat.' },
                        { name: `👞 ${serverConfig.prefix}kick @membre`, value: 'Expulse.' },
                        { name: `🚫 ${serverConfig.prefix}ban @membre`, value: 'Bannit.' },
                        { name: `🤐 ${serverConfig.prefix}mute @membre [temps]`, value: 'Mute.' }
                    ]
                };
                return interaction.reply({ embeds: [staffEmbed], ephemeral: true });
            }
            if (interaction.customId === 'cfg_prefix') {
                await interaction.update({ content: '✍️ **Entre le nouveau préfixe :**', embeds: [], components: [] });
                const msgCollector = message.channel.createMessageCollector({ filter: m => m.author.id === message.author.id, max: 1, time: 30000 });
                msgCollector.on('collect', async (m) => {
                    serverConfig.prefix = m.content.trim().split(/ +/)[0];
                    try { await m.delete(); } catch(e){}
                    await panelMessage.edit({ content: `✅ Mis à jour !`, embeds: [generateConfigEmbed()], components: [mainRow] });
                });
            }
            if (interaction.customId === 'cfg_role_btn') {
                const roleMenuRow = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('cfg_role_select').setPlaceholder('Sélectionne un rôle...').setMaxValues(1));
                await interaction.update({ content: '👋 **Étape 2 : Choisis le rôle :**', embeds: [], components: [roleMenuRow] });
            }
            if (interaction.customId === 'cfg_role_select') {
                serverConfig.welcomeRole = interaction.values[0];
                await interaction.update({ content: `✅ Rôle mis à jour !`, embeds: [generateConfigEmbed()], components: [mainRow] });
            }
        });
        return;
    }

    // --- COMMANDE : !STAFF / !HELP ---
    if (command === 'staff' || command === 'help') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

        const staffEmbed = {
            color: 0x0099ff,
            title: '🛠️ GUIDE MODÉRATION',
            fields: [
                { name: `🧹 ${currentPrefix}clear [1-100]`, value: 'Nettoie les messages.' },
                { name: `👞 ${currentPrefix}kick @membre`, value: 'Expulse un utilisateur.' },
                { name: `🚫 ${currentPrefix}ban @membre`, value: 'Bannit un membre.' },
                { name: `🤐 ${currentPrefix}mute @membre [temps]`, value: 'Exclut temporairement.' },
                { name: `⚙️ ${currentPrefix}config`, value: 'Ouvre le panneau de configuration.' },
                { name: `🎁 ${currentPrefix}setupcodes`, value: 'Installe le bouton permanent des codes Roblox.' }
            ]
        };
        return message.channel.send({ embeds: [staffEmbed] }).then(m => setTimeout(() => m.delete(), 30000));
    }

    // --- COMMANDE : !MUTE ---
    if (command === 'mute') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const member = message.mentions.members.first();
        const duration = args[1];
        if (!member) return message.reply("Mentionne quelqu'un.").then(m => setTimeout(() => m.delete(), 5000));
        
        let time = 0;
        switch (duration) {
            case '1m': time = 60 * 1000; break;
            case '5m': time = 5 * 60 * 1000; break;
            case '10m': time = 10 * 60 * 1000; break;
            case '30m': time = 30 * 60 * 1000; break;
            case '1h': time = 60 * 60 * 1000; break;
            default: return message.reply("Durée invalide : 1m, 5m, 10m, 30m, 1h.").then(m => setTimeout(() => m.delete(), 5000));
        }
        try {
            await member.timeout(time, "Mute via commande");
            message.channel.send(`🤐 **${member.user.tag}** a été exclu pour **${duration}**.`).then(m => setTimeout(() => m.delete(), 5000));
        } catch (err) { message.reply("Erreur de hiérarchie.").then(m => setTimeout(() => m.delete(), 5000)); }
    }

    // --- COMMANDE : !CLEAR ---
    if (command === 'clear') {
        try { await message.delete(); } catch (err) {}
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Chiffre entre 1 et 100.").then(m => setTimeout(() => m.delete(), 5000));
        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            message.channel.send(`✅ **${deleted.size}** messages supprimés.`).then(m => setTimeout(() => m.delete(), 3000));
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
            if (collected.first().content.toLowerCase() === 'oui') {
                await member.ban();
                message.channel.send(`🚫 **${member.user.tag}** banni.`);
            } else { message.channel.send("Annulé.").then(m => setTimeout(() => m.delete(), 5000)); }
            try { await collected.first().delete(); } catch(e){}
            try { await confirmMsg.delete(); } catch(e){}
        } catch (err) { try { await confirmMsg.delete(); } catch(e){} }
    }
});

client.login(process.env.TOKEN);
