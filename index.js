const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const express = require('express');

// --- 1. CONFIGURATION DU SERVEUR POUR RENDER ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Seimi est opérationnel.'));
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
// Note : Si le bot redémarre sur Render, ces valeurs reviendront par défaut.
const serverConfig = {
    prefix: "!",
    welcomeRole: "Arrivant"
};

client.on('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
});

// --- ENREGISTREMENT D'UN NOUVEAU MEMBRE ---
client.on('guildMemberAdd', async (member) => {
    const roleName = serverConfig.welcomeRole; 
    const role = member.guild.roles.cache.find(r => r.name === roleName || r.id === roleName);

    if (!role) {
        return console.log(`[ERREUR BIENVENUE] Le rôle "${roleName}" est introuvable.`);
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
    // On utilise le préfixe dynamique de la configuration
    const currentPrefix = serverConfig.prefix;

    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- COMMANDE : !CONFIG (PANEL DE CONFIGURATION) ---
    if (command === 'config') {
        // Sécurité : Seuls les admins ou gestionnaires du serveur peuvent configurer
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply("⚠️ Tu dois disposer de la permission `Gérer le serveur` pour modifier ma configuration.");
        }

        // Fonction pour générer l'embed du panel
        const generateConfigEmbed = () => {
            return {
                color: 0x5865F2,
                title: '⚙️ PANNEAU DE CONFIGURATION - SEIMI',
                description: 'Clique sur les boutons ci-dessous pour modifier la configuration du bot comme sur DraftBot.',
                fields: [
                    { name: '📌 Préfixe Actuel', value: `\`${serverConfig.prefix}\``, inline: true },
                    { name: '👋 Rôle d\'Arrivée', value: `\`${serverConfig.welcomeRole}\``, inline: true }
                ],
                footer: { text: 'Session active pendant 2 minutes' },
                timestamp: new Date()
            };
        };

        // Création des boutons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cfg_prefix')
                .setLabel('Modifier le Préfixe')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📌'),
            new ButtonBuilder()
                .setCustomId('cfg_role')
                .setLabel('Modifier le Rôle d\'Arrivée')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👋'),
            new ButtonBuilder()
                .setCustomId('cfg_close')
                .setLabel('Fermer')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );

        const panelMessage = await message.channel.send({
            embeds: [generateConfigEmbed()],
            components: [row]
        });

        // Collecteur d'interactions pour les boutons (durée : 2 minutes)
        const buttonCollector = panelMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        buttonCollector.on('collect', async (interaction) => {
            // Seul l'auteur de la commande peut cliquer
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "❌ Ce n'est pas ton panneau de configuration.", ephemeral: true });
            }

            if (interaction.customId === 'cfg_close') {
                buttonCollector.stop();
                return interaction.update({ content: '🔒 Panneau de configuration fermé.', embeds: [], components: [] });
            }

            // Si on change le préfixe
            if (interaction.customId === 'cfg_prefix') {
                await interaction.update({ content: '✍️ **Entre le nouveau préfixe dans le salon :**', components: [] });
                
                const filter = m => m.author.id === message.author.id;
                const msgCollector = message.channel.createMessageCollector({ filter, max: 1, time: 30000 });

                msgCollector.on('collect', async (m) => {
                    const newPrefix = m.content.trim().split(/ +/)[0];
                    serverConfig.prefix = newPrefix;
                    try { await m.delete(); } catch(e){} // Supprime le message de l'utilisateur pour faire propre
                    
                    await panelMessage.edit({ content: `✅ Préfixe mis à jour avec succès !`, embeds: [generateConfigEmbed()], components: [row] });
                });
            }

            // Si on change le rôle d'arrivée
            if (interaction.customId === 'cfg_role') {
                await interaction.update({ content: '✍️ **Entre le NOM exact du rôle d\'arrivée (Ex: Membre) :**', components: [] });
                
                const filter = m => m.author.id === message.author.id;
                const msgCollector = message.channel.createMessageCollector({ filter, max: 1, time: 30000 });

                msgCollector.on('collect', async (m) => {
                    const newRole = m.content.trim();
                    serverConfig.welcomeRole = newRole;
                    try { await m.delete(); } catch(e){}
                    
                    await panelMessage.edit({ content: `✅ Rôle de bienvenue mis à jour !`, embeds: [generateConfigEmbed()], components: [row] });
                });
            }
        });

        buttonCollector.on('end', async () => {
            // Nettoyage des boutons à la fin du temps imparti si le panel n'a pas été fermé manuellement
            try {
                await panelMessage.edit({ components: [] });
            } catch (err) {}
        });

        return; // On stoppe ici pour ne pas exécuter le reste du code de messageCreate
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
            return message.reply(``💢 **${repliquesVip[Math.floor(Math.random() * repliquesVip.length)]}**`);
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
