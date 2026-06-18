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

// Permet à Express de lire les données JSON envoyées depuis le Dashboard
app.use(express.json());

const commandLogs = [];
const visitorLogs = [];
const ADMIN_PIN = "06122023A"; // 🔐 Ton code PIN secret sécurisé à l'abri des regards

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

// Route Publique pour les logs (Toujours accessible par Cron-job / UptimeRobot)
app.get('/api/logs', (req, res) => {
    res.json({ commands: commandLogs, visitors: visitorLogs });
});

// --- 🔓 ROUTES SÉCURISÉES DU DASHBOARD INTERACTIF ---

// 1. Lancer une annonce depuis le site
app.post('/api/admin/annonce', async (req, res) => {
    const { pin, channelId, text } = req.body;

    if (pin !== ADMIN_PIN) {
        return res.status(403).json({ success: false, message: "❌ Code PIN incorrect ! Action refusée." });
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.json({ success: false, message: "❌ Salon introuvable." });

        const annonceEmbed = {
            color: 0x9B5DE5,
            title: '📢 ANNONCE OFFICIELLE',
            description: text,
            timestamp: new Date(),
            footer: { text: 'Envoyé depuis le Panneau d’administration Web' }
        };

        await channel.send({ embeds: [annonceEmbed] });
        logCommand("Dashboard Web", `Annonce envoyée dans <#${channelId}>`);
        return res.json({ success: true, message: "✅ Annonce publiée avec succès sur Discord !" });
    } catch (err) {
        return res.json({ success: false, message: `❌ Erreur : ${err.message}` });
    }
});

// 2. Clear un salon à distance depuis le site
app.post('/api/admin/clear', async (req, res) => {
    const { pin, channelId } = req.body;

    if (pin !== ADMIN_PIN) {
        return res.status(403).json({ success: false, message: "❌ Code PIN incorrect ! Action refusée." });
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.json({ success: false, message: "❌ Salon textuel introuvable." });

        await channel.bulkDelete(20, true);
        logCommand("Dashboard Web", `Clear 20 messages dans <#${channelId}>`);
        return res.json({ success: true, message: "✅ 20 messages supprimés sur Discord !" });
    } catch (err) {
        return res.json({ success: false, message: `❌ Erreur : ${err.message}` });
    }
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

    // Configuration Tickets
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

    if (interaction.customId === 'btn_get_codes') {
        const codesEmbed = {
            color: 0x00E676,
            title: '🎮 CODES DE RÉCOMPENSE ROBLOX',
            description: `Bonjour ${interaction.user}, voici l'espace des codes actifs !`,
            fields: [
                { name: '📌 Codes Actifs', value: '❌ *Aucun code promotionnel n\'est disponible pour le moment.*' },
                { name: '💡 Info', value: 'Reviens régulièrement !' }
            ],
            footer: { text: '🔒 Ce message n\'est visible que par vous' },
            timestamp: new Date()
        };
        return interaction.reply({ embeds: [codesEmbed], ephemeral: true });
    }

    if (interaction.customId === 'btn_open_ticket') {
        const guild = interaction.guild;
        const member = interaction.member;

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
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ],
            });

            const welcomeTicketEmbed = {
                color: 0x9B5DE5,
                title: '📨 ASSISTANCE - SEIMI BOT',
                description: `Bonjour ${member},\n\nMerci d'avoir contacté le support. Un membre de l'équipe va te prendre en charge.`,
                footer: { text: 'Pour fermer ce ticket, cliquez sur le bouton ci-dessous.' },
                timestamp: new Date()
            };

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            await ticketChannel.send({ content: `👋 ${member} | <@&1463629608518815804>`, embeds: [welcomeTicketEmbed], components: [closeRow] });
            return interaction.editReply({ content: `✅ Ton ticket a été créé avec succès : ${ticketChannel}` });
        } catch (err) {
            return interaction.editReply({ content: "❌ Une erreur est survenue lors de la création du ticket." });
        }
    }

    if (interaction.customId === 'btn_close_ticket') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return interaction.reply({ content: "❌ Seul un membre du personnel peut clore ce ticket.", ephemeral: true });
        }
        await interaction.reply({ content: "🔒 Fermeture dans 5 secondes..." });
        setTimeout(async () => { try { await interaction.channel.delete(); } catch(e) {} }, 5000);
        return;
    }

    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const userId = parts[1];
        const originChannelId = parts[2];
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        const originChannel = guild.channels.cache.get(originChannelId);

        if (!member) return interaction.reply({ content: "❌ Absent.", ephemeral: true });

        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) {
                if (originChannel) originChannel.send(`⚠️ ${member}, tu as quitté l'attente !`).then(m => setTimeout(() => m.delete(), 6000));
                return interaction.update({ content: `❌ Absent du vocal.`, embeds: [], components: [] });
            }
            try {
                await member.voice.setChannel(serverConfig.privateVoiceId);
                return interaction.update({ content: `🟢 Accepté pour **${member.user.tag}**.`, embeds: [], components: [] });
            } catch (err) {}
        }
        if (action === 'md') {
            if (originChannel) originChannel.send(`❌ ${member}, refusé.`).then(m => setTimeout(() => m.delete(), 6000));
            return interaction.update({ content: `🔴 Refusé pour **${member.user.tag}**.`, embeds: [], components: [] });
        }
    }

    if (interaction.customId === 'cfg_role_select') {
        serverConfig.welcomeRole = interaction.values[0];
        return interaction.update({ content: `✅ Rôle mis à jour !`, components: [] });
    }
});

// LISTENER MESSAGES & COMMANDES
client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;
    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    logCommand(message.author.tag, currentPrefix + command + (args.length ? ' ' + args.join(' ') : ''));

    if (command === 'setupticket') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
        const ticketSetupEmbed = {
            color: 0x9B5DE5,
            title: '📩 ASSISTANCE & SUPPORT TECHNIQUE',
            description: 'Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé.',
            footer: { text: 'Seimi Bot' }
        };
        const ticketRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('Ouvrir un Ticket').setStyle(ButtonStyle.Primary).setEmoji('📨')
        );
        await message.channel.send({ embeds: [ticketSetupEmbed], components: [ticketRow] });
        setTimeout(async () => { try { await message.delete(); } catch (e){} }, 1000);
        return;
    }

    if (command === 'moov') {
        const voiceState = message.member.voice;
        if (!voiceState.channel || voiceState.channel.id !== serverConfig.waitingVoiceId) {
            try { await message.delete(); } catch(e){}
            return message.channel.send(`⚠️ Devrait être dans l'attente.`).then(m => setTimeout(() => m.delete(), 6000));
        }
        const adminTextChannel = message.guild.channels.cache.get(serverConfig.adminTextId);
        if (!adminTextChannel) return;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ma_${message.author.id}_${message.channel.id}`).setLabel('Accepter').setStyle(ButtonStyle.Success).setEmoji('🟢'),
            new ButtonBuilder().setCustomId(`md_${message.author.id}_${message.channel.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('🔴')
        );
        await adminTextChannel.send({ content: `🔔 Demande de ${message.author.tag}`, components: [row] });
        try { await message.delete(); } catch(e){}
        return;
    }

    if (command === 'setupcodes') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
        const setupEmbed = { color: 0x00E676, title: '🎁 CODES ROBLOX', description: 'Clique ci-dessous.' };
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_get_codes').setLabel('Codes').setStyle(ButtonStyle.Success));
        await message.channel.send({ embeds: [setupEmbed], components: [row] });
        setTimeout(async () => { try { await message.delete(); } catch(e){} }, 1000);
        return;
    }

    if (command === 'config') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) return;
        const generateConfigEmbed = () => ({
            color: 0x5865F2, title: '⚙️ PANNEAU CONFIG', fields: [{ name: 'Préfixe', value: `\`${serverConfig.prefix}\`` }]
        });
        const mainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cfg_prefix').setLabel('Préfixe').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cfg_close').setLabel('Fermer').setStyle(ButtonStyle.Danger)
        );
        const panelMessage = await message.channel.send({ embeds: [generateConfigEmbed()], components: [mainRow] });
        setTimeout(async () => { try { await message.delete(); } catch(e){} }, 1000);

        const collector = panelMessage.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'cfg_close') { collector.stop(); try { await panelMessage.delete(); } catch(e){} }
        });
        return;
    }

    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return;
        try { await message.channel.bulkDelete(amount, true); } catch (err) {}
    }
});

client.login(process.env.TOKEN);
