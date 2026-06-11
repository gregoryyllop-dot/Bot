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

// Permet de lire les fichiers du dossier "public" (HTML, CSS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Envoie le site vitrine quand on visite l'URL Render
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
    welcomeRole: "Arrivant"
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
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply("⚠️ Tu dois disposer de la permission `Gérer le serveur` pour modifier ma configuration.");
        }

        const getRoleDisplay = () => {
            const role = message.guild.roles.cache.get(serverConfig.welcomeRole);
            return role ? `<@&${role.id}>` : `\`${serverConfig.welcomeRole}\``;
        };

        const generateConfigEmbed = () => {
            return {
                color: 0x5865F2,
                title: '⚙️ PANNEAU DE CONFIGURATION - SEIMI',
                description: 'Modifie les options système et accède aux outils de gestion du personnel.',
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

        const roleMenuRow = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
                .setCustomId('cfg_role_select')
                .setPlaceholder('Sélectionner le rôle d\'arrivée...')
                .setMaxValues(1)
        );

        const panelMessage = await message.channel.send({
            embeds: [generateConfigEmbed()],
            components: [roleMenuRow, mainRow]
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
                    footer: { text: 'Système Chroniques de la Zone 5' },
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
                    
                    await panelMessage.edit({ content: `✅ Préfixe mis à jour avec succès !`, embeds: [generateConfigEmbed()], components: [roleMenuRow, mainRow] });
                });
            }

            if (interaction.customId === 'cfg_role_select') {
                const selectedRoleId = interaction.values[0];
                serverConfig.welcomeRole = selectedRoleId;
                
                await interaction.update({
                    content: `✅ Rôle de bienvenue mis à jour !`,
                    embeds: [generateConfigEmbed()],
                    components: [roleMenuRow, mainRow]
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

    // --- COMMANDE : !STAFF / !HELP ---
    if (command === 'staff' || command === 'help') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("⚠️ Accès réservé au personnel modérateur.");
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
                { name: `⚙️ ${currentPrefix}config`, value: 'Ouvre le panneau de configuration interactif.' }
            ],
            footer: { text: 'Système Chroniques de la Zone 5' },
            timestamp: new Date(),
        };
        return message.channel.send({ embeds: [staffEmbed] });
    }

    // --- COMMANDE : !MUTE ---
    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const member = message.mentions.members.first();
        const duration = args[1];
        if (!member) return message.reply("Mentionne un membre à réduire au silence.");
        
        let time = 0;
        switch (duration) {
            case '1m': time = 60 * 1000; break;
            case '5m': time = 5 * 60 * 1000; break;
            case '10m': time = 10 * 60 * 1000; break;
            case '30m': time = 30 * 60 * 1000; break;
            case '1h': time = 60 * 60 * 1000; break;
            default: return message.reply("Précise une durée valide : `1m`, `5m`, `10m`, `30m` ou `1h`.");
        }

        try {
            await member.timeout(time, "Mute via commande !mute");
            message.channel.send(`🤐 **${member.user.tag}** a été réduit au silence pour **${duration}**.`);
        } catch (err) {
            message.reply("❌ Impossible de mute ce membre.");
        }
    }

    // --- COMMANDE : !CLEAR ---
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Chiffre entre 1 et 100, Einstein.");
        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            message.channel.send(`✅ **${deleted.size}** messages supprimés.`).then(m => setTimeout(() => m.delete(), 3000));
        } catch (err) { message.reply("❌ Erreur de suppression."); }
    }

    // --- COMMANDE : !BAN ---
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne quelqu'un, je ne devine pas les noms.");

        const vips = ['sseikaa', 'linqui0162'];
        if (vips.includes(member.user.username.toLowerCase())) {
            const repliquesVip = [
                "Tu te prends pour qui, espèce de déchet ? Jamais je ne toucherai à l'élite.",
                "Mdr, regarde-toi essayer de ban un dieu alors que t'es qu'une merde. Dégage.",
                "Espèce de sous-être, pose encore tes mains sales sur cette commande et c'est toi que j'efface."
            ];
            return message.reply(`💢 **${repliquesVip[Math.floor(Math.random() * repliquesVip.length)]}**`);
        }

        if (member.id === message.author.id) {
            return message.reply("🤡 T'es sérieux à vouloir t'auto-ban ? Hors de ma vue.");
        }

        message.reply(`⚠️ Confirme le bannissement de **${member.user.tag}** ? (oui/non)`);
        const filter = m => m.author.id === message.author.id && ['oui', 'non'].includes(m.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000 });
            if (collected.first().content.toLowerCase() === 'oui') {
                await member.ban();
                message.channel.send(`🚫 **${member.user.tag}** a été éjecté proprement.`);
            } else { 
                message.channel.send("✅ Annulé. T'as eu de la chance."); 
            }
        } catch (err) { 
            message.channel.send("⌛ Trop lent."); 
        }
    }
});

client.login(process.env.TOKEN);
