const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType
} = require('discord.js');
const express = require('express');
const path = require('path');

// --- 1. SERVEUR WEB ---
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

const commandLogs = [];
const visitorLogs = [];
const ADMIN_PIN = "06122023A"; 

function logCommand(user, command) {
    const time = new Date().toLocaleTimeString('fr-FR', { 
        timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
    commandLogs.unshift({ time, user, command });
    if (commandLogs.length > 10) commandLogs.pop();
}

app.use((req, res, next) => {
    if (req.url === '/' || req.url === '/index.html') {
        const userAgent = req.headers['user-agent'] || '';
        const time = new Date().toLocaleTimeString('fr-FR', { 
            timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });
        const isBot = ['bot', 'cron-job', 'uptimerobot'].some(k => userAgent.toLowerCase().includes(k));
        const visitorType = isBot ? '🤖 BOT / MONITOR' : '👤 HUMAIN';
        visitorLogs.unshift({ time, type: visitorType, device: userAgent });
        if (visitorLogs.length > 10) visitorLogs.pop();
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/logs', (req, res) => res.json({ commands: commandLogs, visitors: visitorLogs }));

// ROUTE ANNONCE : Changée pour envoyer en texte brut avec ping @everyone
app.post('/api/admin/annonce', async (req, res) => {
    const { pin, channelId, text } = req.body;
    if (pin !== ADMIN_PIN) return res.status(403).json({ success: false, message: "❌ PIN invalide." });

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.json({ success: false, message: "❌ Salon introuvable." });

        // Envoi en message simple avec la mention everyone en clair
        await channel.send({ content: `📢 @everyone\n\n${text}` });
        
        logCommand("Dashboard Web", `Annonce brute diffusée dans <#${channelId}>`);
        return res.json({ success: true, message: "✅ Annonce brute diffusée avec mention @everyone !" });
    } catch (err) {
        return res.json({ success: false, message: `❌ Erreur : ${err.message}` });
    }
});

// ROUTE CLEAR : Adaptée pour recevoir la quantité exacte ("amount") depuis l'interface
app.post('/api/admin/clear', async (req, res) => {
    const { pin, channelId, amount } = req.body;
    if (pin !== ADMIN_PIN) return res.status(403).json({ success: false, message: "❌ PIN invalide." });

    const limit = amount && amount <= 100 ? amount : 20;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.json({ success: false, message: "❌ Salon textuel invalide." });

        await channel.bulkDelete(limit, true);
        logCommand("Dashboard Web", `Purge de ${limit} messages dans <#${channelId}>`);
        return res.json({ success: true, message: `✅ Flux nettoyé (${limit} messages supprimés) !` });
    } catch (err) {
        return res.json({ success: false, message: `❌ Erreur : ${err.message}` });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(port, '0.0.0.0', () => console.log(`🚀 Console active sur le port ${port}`));


// --- 2. LOGIQUE DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates 
    ]
});

const serverConfig = {
    prefix: "!", welcomeRole: "Arrivant", codesChannelId: "1514658424791502848", 
    waitingVoiceId: "1468303822731612348", privateVoiceId: "1498498611275895005", 
    adminTextId: "1515043230960324800", ticketCategoryId: "1463929005395808329" 
};

client.on('ready', () => console.log(`🤖 Seimi Engine connecté : ${client.user.tag}`));

client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(serverConfig.welcomeRole) || member.guild.roles.cache.find(r => r.name === serverConfig.welcomeRole);
    if (role) try { await member.roles.add(role); } catch (e) {}
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'btn_get_codes') {
        return interaction.reply({ embeds: [{
            color: 0x45f3ff, title: '🎮 CODES ROBLOX', description: `Espace des récompenses actives.`,
            fields: [{ name: '📌 Codes Actifs', value: '❌ *Aucun code promotionnel disponible.*' }]
        }], ephemeral: true });
    }

    if (interaction.customId === 'btn_open_ticket') {
        const guild = interaction.guild; const member = interaction.member;
        const existing = guild.channels.cache.find(c => c.name === `📩-ticket-${member.user.username.toLowerCase()}`);
        if (existing) return interaction.reply({ content: `⚠️ Flux déjà ouvert : ${existing}`, ephemeral: true });

        await interaction.reply({ content: "⏳ Initialisation...", ephemeral: true });
        try {
            const ticketChannel = await guild.channels.create({
                name: `📩-ticket-${member.user.username}`, type: ChannelType.GuildText, parent: serverConfig.ticketCategoryId || null,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ],
            });
            const closeRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger));
            await ticketChannel.send({ content: `👋 ${member} | Support`, components: [closeRow] });
            return interaction.editReply({ content: `✅ Créé : ${ticketChannel}` });
        } catch (e) { return interaction.editReply({ content: "❌ Échec." }); }
    }

    if (interaction.customId === 'btn_close_ticket') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: "❌ Refusé.", ephemeral: true });
        await interaction.reply({ content: "🔒 Archivage..." });
        setTimeout(async () => { try { await interaction.channel.delete(); } catch(e) {} }, 5000);
    }

    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        const parts = interaction.customId.split('_');
        const action = parts[0]; const userId = parts[1];
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (!member) return interaction.reply({ content: "❌ Introuvable.", ephemeral: true });
        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) return interaction.update({ content: `❌ Plus en vocal.`, components: [] });
            try { await member.voice.setChannel(serverConfig.privateVoiceId); return interaction.update({ content: `🟢 Transféré.`, components: [] }); } catch (e) {}
        }
        if (action === 'md') return interaction.update({ content: `🔴 Rejeté.`, components: [] });
    }
});

client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;
    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    logCommand(message.author.tag, currentPrefix + command + (args.length ? ' ' + args.join(' ') : ''));

    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]); if (isNaN(amount) || amount < 1 || amount > 100) return;
        try { await message.channel.bulkDelete(amount, true); } catch (err) {}
    }
    // Reste de tes commandes Discord inchangées...
});

client.login(process.env.TOKEN);
