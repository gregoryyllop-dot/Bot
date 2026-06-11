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

// --- BASE DE DONNÉES TEMPORAIRE (Sauvegardée en mémoire) ---
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

    if (!role) {
        return console.log(`[ERREUR BIENVENUE] Le rôle "${roleNameOrId}" est introuvable.`);
    }

    try {
        await member.roles.add(role);
        console.log(`[BIENVENUE] Rôle "${role.name}" attribué à ${member.user.tag}.`);
    } catch (err) {
        console.error(`[ERREUR BIENVENUE] Impossible d'attribuer le rôle. Vérifie la hiérarchie.`);
    }
});

// --- GESTION DES MESSAGES & COMMANDES ---
client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;

    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- COMMANDE : !CONFIG (PANEL DE CONFIGURATION) ---
    if (command === 'config') {
        try { await message.delete(); } catch (err) {}

        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply("⚠️ Tu dois disposer de la permission `Gérer le serveur` pour modifier ma configuration.").then(m => setTimeout(() => m.delete(), 5000));
        }

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
            new ButtonBuilder()
                .setCustomId('cfg_prefix')
                .setLabel('Modifier le Préfixe')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌'),
            new ButtonBuilder()
                .setCustomId('cfg_role_btn')
                .setLabel('Modifier le Rôle')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👋'),
            new ButtonBuilder()
                .setCustomId('cfg_staff_help')
                .setLabel('Guide Modération')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛠️'),
            new ButtonBuilder()
                .setCustomId('cfg_close')
                .setLabel('Fermer')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        const panelMessage = await message.channel.send({
            embeds: [generateConfigEmbed()],
            components: [mainRow]
        });

        const collector = panelMessage.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "❌ Ce n'est pas ton panneau de configuration.", ephemeral: true });
            }

            if (interaction.customId === 'cfg_close') {
                collector.stop();
                return interaction.update({ content: '🔒 Panneau de configuration fermé.', embeds: [], components: [] });
            }

            if (interaction.customId === 'cfg_staff_help') {
                const staffEmbed = {
                    color: 0x0099ff,
                    title: '🛠️ GUIDE MODÉRATION - SEIMI BOT',
                    description: `Liste des commandes de modération.`,
                    fields: [
                        { name: `🧹 ${serverConfig.prefix}clear [1-100]`, value: 'Nettoie les messages récents.' },
                        { name: `👞 ${serverConfig.prefix}kick @membre`, value: 'Expulse un utilisateur.' },
                        { name: `🚫 ${serverConfig.prefix}ban @membre`, value: 'Bannit un membre (confirmation requise).' },
                        { name: `🤐 ${serverConfig.prefix}mute @membre [temps]`, value: 'Exclut : 1m, 5m, 10m, 30m, 1h.' }
                    ],
                    footer: { text: 'Système global de gestion' },
                    timestamp: new Date(),
                };
                return interaction.reply({ embeds: [staffEmbed], ephemeral: true });
            }

            if (interaction.customId === 'cfg_prefix') {
                await interaction.update({ content: '✍️ **Entre le nouveau préfixe dans le salon :**', embeds: [], components: [] });
                
                const filter = m => m.author.id === message.author.id;
                const msgCollector = message.channel.createMessageCollector({ filter, max: 1, time: 30000 });

                msgCollector.on('collect', async (m) => {
                    const newPrefix = m.content.trim().split(/ +/)[0];
                    serverConfig.prefix = newPrefix;
                    try { await m.delete(); } catch(e){}
                    
                    await panelMessage.edit({ content: `✅ Préfixe mis à jour avec succès !`, embeds: [generateConfigEmbed()], components: [mainRow] });
                });
            }

            if (interaction.customId === 'cfg_role_btn') {
                const roleMenuRow = new ActionRowBuilder().addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId('cfg_role_select')
                        .setPlaceholder('Sélectionne le rôle d\'arrivée dans la liste...')
                        .setMaxValues(1)
                );

                await interaction.update({ 
                    content: '👋 **Étape 2 : Choisis le rôle d\'arrivée dans le menu déroulant ci-dessous :**', 
                    embeds: [], 
                    components: [roleMenuRow] 
                });
            }

            if (interaction.customId === 'cfg_role_select') {
                const selectedRoleId = interaction.values[0];
                serverConfig.welcomeRole = selectedRoleId;
                
                await interaction.update({
                    content: `✅ Rôle de bienvenue mis à jour !`,
                    embeds: [generateConfigEmbed()],
                    components: [mainRow]
                });
            }
        });

        collector.on('end', async () => {
            try {
                await panelMessage.edit({ components: [] });
            } catch (err) {}
        });

        return;
    }

    // --- COMMANDE : !CODES (ROBLOX REWARDS - VERSION SÉCURISÉE) ---
    if (command === 'codes') {
        try { await message.delete(); } catch (err) {}

        // Sécurité : Vérifie si la commande est bien tapée dans ton salon dédié
        if (message.channel.id !== serverConfig.codesChannelId) {
            return message.author.send(`⚠️ La commande \`!codes\` est utilisable uniquement dans le salon dédié : <#${serverConfig.codesChannelId}>.`)
                .catch(() => {
                    message.channel.send(`⚠️ **${message.author}**, la commande \`!codes\` doit être utilisée dans <#${serverConfig.codesChannelId}>.`)
                        .then(m => setTimeout(() => m.delete(), 5000));
                });
        }

        const codesEmbed = {
            color: 0x00E676,
            title: '🎮 CODES DE RÉCOMPENSE ROBLOX',
            description: 'Retrouve ici tes codes actifs ! Ce message n\'est visible que par toi.',
            fields: [
                { name: '📌 Codes Actifs', value: '❌ *Aucun code promotionnel n\'est disponible pour le moment.*' },
                { name: '💡 Info', value: 'Reviens régulièrement ! Les nouveaux codes s\'afficheront ici dès qu\'ils sortiront.' }
            ],
            footer: { text: 'Espace personnel Seimi' },
            timestamp: new Date()
        };

        // On utilise un bouton ou une interaction simulée pour que la réponse reste 100% secrète (Éphémère)
        // Comme les messages classiques ne peuvent pas être éphémères, on envoie l'embed via un message direct secret
        return message.author.send({ embeds: [codesEmbed] }).catch(async () => {
            // Si les MP du membre sont fermés, on envoie un message temporaire dans le salon
            const m = await message.channel.send({ content: `⚠️ ${message.author}, ouvre tes messages privés pour recevoir tes codes, ou utilise le système d'interaction du salon !`, embeds: [codesEmbed] });
            setTimeout(() => m.delete(), 15000);
        });
    }

    // --- COMMANDE : !STAFF / !HELP ---
    if (command === 'staff' || command === 'help') {
        try { await message.delete(); } catch (err) {}

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("⚠️ Accès réservé au personnel modérateur.").then(m => setTimeout(() => m.delete(), 5000));
        }

        const staffEmbed = {
            color: 0x0099ff,
            title: '🛠️ GUIDE MODÉRATION - SEIMI BOT',
            description: `Liste des commandes disponibles pour le personnel. (Préfixe actuel : \`${currentPrefix}\`)`,
            fields: [
                { name: `🧹 ${currentPrefix}clear [1-100]`, value: 'Nettoie les messages récents.' },
                { name: `👞 ${currentPrefix}kick @membre`, value: 'Expulse un utilisateur.' },
                { name: `🚫 ${currentPrefix}ban @membre`, value: 'Bannit un membre (confirmation requise).' },
                { name: `🤐 ${currentPrefix}mute @membre [temps]`, value: 'Exclut : 1m, 5m, 10m, 30m, 1h.' },
                { name: `🎮 ${currentPrefix}codes`, value: 'Affiche l\'espace des codes Roblox publics.' },
                { name: `⚙️ ${currentPrefix}config`, value: 'Ouvre le panneau de configuration interactif.' }
            ],
            footer: { text: 'Seimi Bot Management' },
            timestamp: new Date(),
        };
        return message.channel.send({ embeds: [staffEmbed] }).then(m => setTimeout(() => m.delete(), 30000));
    }

    // --- COMMANDE : !MUTE ---
    if (command === 'mute') {
        try { await message.delete(); } catch (err) {}

        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const member = message.mentions.members.first();
        const duration = args[1];
        if (!member) return message.reply("Veuillez mentionner le membre à exclure temporairement.").then(m => setTimeout(() => m.delete(), 5000));
        
        let time = 0;
        switch (duration) {
            case '1m': time = 60 * 1000; break;
            case '5m': time = 5 * 60 * 1000; break;
            case '10m': time = 10 * 60 * 1000; break;
            case '30m': time = 30 * 60 * 1000; break;
            case '1h': time = 60 * 60 * 1000; break;
            default: return message.reply("Veuillez préciser une durée valide : `1m`, `5m`, `10m`, `30m` ou `1h`.").then(m => setTimeout(() => m.delete(), 5000));
        }

        try {
            await member.timeout(time, "Mute via commande !mute");
            message.channel.send(`🤐 **${member.user.tag}** a été exclu temporairement pour une durée de **${duration}**.`).then(m => setTimeout(() => m.delete(), 5000));
        } catch (err) {
            message.reply("❌ Impossible de modifier le statut de ce membre (vérifiez la hiérarchie des rôles).").then(m => setTimeout(() => m.delete(), 5000));
        }
    }

    // --- COMMANDE : !CLEAR ---
    if (command === 'clear') {
        try { await message.delete(); } catch (err) {}

        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Veuillez indiquer un nombre de messages à supprimer compris entre 1 et 100.").then(m => setTimeout(() => m.delete(), 5000));
        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            message.channel.send(`✅ **${deleted.size}** messages ont été supprimés avec succès.`).then(m => setTimeout(() => m.delete(), 3000));
        } catch (err) { message.reply("❌ Une erreur est survenue lors de la suppression des messages.").then(m => setTimeout(() => m.delete(), 5000)); }
    }

    // --- COMMANDE : !BAN ---
    if (command === 'ban') {
        try { await message.delete(); } catch (err) {}

        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        const member = message.mentions.members.first();
        if (!member) return message.reply("Veuillez mentionner le membre à bannir.").then(m => setTimeout(() => m.delete(), 5000));

        if (member.id === message.author.id) {
            return message.reply("⚠️ Vous ne pouvez pas appliquer cette action sur vous-même.").then(m => setTimeout(() => m.delete(), 5000));
        }

        if (!member.bannable) {
            return message.reply("❌ Impossible de procéder au bannissement. Mes privilèges actuels ne me permettent pas de sanctionner cet utilisateur.").then(m => setTimeout(() => m.delete(), 5000));
        }

        const confirmMsg = await message.channel.send(`⚠️ Confirmez-vous le bannissement définitif de **${member.user.tag}** ? (Répondez par \`oui\` ou \`non\`)`);
        const filter = m => m.author.id === message.author.id && ['oui', 'non'].includes(m.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000 });
            const responseMessage = collected.first();
            
            if (responseMessage.content.toLowerCase() === 'oui') {
                await member.ban({ reason: `Banni via commande par ${message.author.tag}` });
                message.channel.send(`🚫 **${member.user.tag}** a été banni du serveur.`);
            } else { 
                message.channel.send("✅ Action annulée.").then(m => setTimeout(() => m.delete(), 5000)); 
            }
            
            try { await responseMessage.delete(); } catch(e){}
            try { await confirmMsg.delete(); } catch(e){}

        } catch (err) { 
            message.channel.send("⌛ Temps de confirmation écoulé, action annulée.").then(m => setTimeout(() => m.delete(), 5000)); 
            try { await confirmMsg.delete(); } catch(e){}
        }
    }
});

client.login(process.env.TOKEN);
