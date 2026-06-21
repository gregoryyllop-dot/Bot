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

app.get('/api/logs', (req, res) => {
    let totalMembers = 0;
    try { totalMembers = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0); } catch (e) { totalMembers = "Indisponible"; }
    res.json({ commands: commandLogs, visitors: visitorLogs, memberCount: totalMembers });
});

app.post('/api/admin/annonce', async (req, res) => {
    const { pin, channelId, text } = req.body;
    if (pin !== ADMIN_PIN) return res.status(403).json({ success: false, message: "❌ PIN invalide." });
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.json({ success: false, message: "❌ Salon introuvable." });
        await channel.send({ content: `📢 @everyone\n\n${text}` });
        logCommand("Dashboard Web", `Annonce brute diffusée dans <#${channelId}>`);
        return res.json({ success: true, message: "✅ Annonce brute diffusée !" });
    } catch (err) { return res.json({ success: false, message: `❌ Erreur : ${err.message}` }); }
});

app.post('/api/admin/clear', async (req, res) => {
    const { pin, channelId, amount } = req.body;
    if (pin !== ADMIN_PIN) return res.status(403).json({ success: false, message: "❌ PIN invalide." });
    const limit = amount && amount <= 100 ? amount : 20;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.json({ success: false, message: "❌ Salon invalide." });
        await channel.bulkDelete(limit, true);
        logCommand("Dashboard Web", `Purge dans <#${channelId}>`);
        return res.json({ success: true, message: `✅ Flux nettoyé !` });
    } catch (err) { return res.json({ success: false, message: `❌ Erreur : ${err.message}` }); }
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
    prefix: "!", 
    welcomeRole: "Arrivant", 
    codesChannelId: "1514658424791502848", 
    waitingVoiceId: "1468303822731612348", 
    privateVoiceId: "1498498611275895005", 
    adminTextId: "1515043230960324800",
    staffRoleId: "1463629608518815804",
    ticketCategoryId: "1463929005395808329"
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

    // --- CRÉATION DE TICKET ---
    if (interaction.customId === 'btn_open_ticket') {
        const guild = interaction.guild; 
        const member = interaction.member;
        const existing = guild.channels.cache.find(c => c.name === `📩-ticket-${member.user.username.toLowerCase()}`);
        
        if (existing) return interaction.reply({ content: `⚠️ Tu as déjà un ticket ouvert ici : ${existing}`, ephemeral: true });

        await interaction.reply({ content: "⏳ Création de votre ticket en cours...", ephemeral: true });
        
        try {
            const ticketChannel = await guild.channels.create({
                name: `📩-ticket-${member.user.username}`, 
                type: ChannelType.GuildText, 
                parent: serverConfig.ticketCategoryId || null,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: serverConfig.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ],
            });

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({ 
                content: `👋 Bienvenue dans ton ticket ${member} !\nLe <@&${serverConfig.staffRoleId}> va arriver pour t'aider.`, 
                components: [closeRow] 
            });

            return interaction.editReply({ content: `✅ Ton ticket a été créé avec succès : ${ticketChannel}` });
        } catch (e) { 
            console.error(e);
            return interaction.editReply({ content: "❌ Impossible de créer le ticket. Vérifie mes permissions et l'ID de la catégorie." }); 
        }
    }

    // --- FERMETURE DE TICKET ---
    if (interaction.customId === 'btn_close_ticket') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return interaction.reply({ content: "❌ Seul le staff peut fermer ce ticket.", ephemeral: true });
        }
        await interaction.reply({ content: "🔒 Archivage et suppression du ticket dans 5 secondes..." });
        setTimeout(async () => { try { await interaction.channel.delete(); } catch(e) {} }, 5000);
        return;
    }

    // --- GESTION DU SYSTÈME MOOV ---
    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return interaction.reply({ content: "❌ Tu n'as pas la permission de valider cette demande.", ephemeral: true });
        }

        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const userId = parts[1];
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (!member) return interaction.update({ content: "❌ Le joueur a quitté le serveur Discord.", components: [] });

        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) {
                return interaction.update({ content: `❌ **${member.user.username}** n'est plus dans le salon d'attente.`, components: [] });
            }
            try { 
                await member.voice.setChannel(serverConfig.privateVoiceId); 
                return interaction.update({ content: `🟢 **${member.user.username}** a été accepté et déplacé par ${interaction.user} !`, components: [] }); 
            } catch (e) { return interaction.reply({ content: "❌ Échec du déplacement.", ephemeral: true }); }
        }

        if (action === 'md') {
            return interaction.update({ content: `🔴 La demande d'accès pour **${member.user.username}** a été refusée par ${interaction.user}.`, components: [] });
        }
    }
});

client.on('messageCreate', async (message) => {
    const currentPrefix = serverConfig.prefix;
    if (!message.content.startsWith(currentPrefix) || message.author.bot) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    logCommand(message.author.tag, currentPrefix + command + (args.length ? ' ' + args.join(' ') : ''));

    // --- COMMANDE !CLEAR ---
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]); if (isNaN(amount) || amount < 1 || amount > 100) return;
        try { await message.channel.bulkDelete(amount, true); } catch (err) {}
    }

    // --- COMMANDE !BAN ---
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
            return message.reply("❌ Tu n'as pas la permission de bannir des membres.");
        }
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Utilisation : `!ban @pseudo [raison]`");
        if (!target.bannable) return message.reply("❌ Je ne peux pas bannir ce membre (Rôle plus haut ou égal au mien).");

        const reason = args.slice(1).join(" ") || "Aucune raison fournie";
        try {
            await target.ban({ reason: reason });
            return message.reply(`✅ **${target.user.username}** a été banni définitivement. Raison : *${reason}*`);
        } catch (e) { return message.reply("❌ Impossible de bannir ce membre."); }
    }

    // --- COMMANDE !KICK ---
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
            return message.reply("❌ Tu n'as pas la permission d'exclure des membres.");
        }
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Utilisation : `!kick @pseudo [raison]`");
        if (!target.kickable) return message.reply("❌ Je ne peux pas exclure ce membre.");

        const reason = args.slice(1).join(" ") || "Aucune raison fournie";
        try {
            await target.kick(reason);
            return message.reply(`✅ **${target.user.username}** a été expulsé du serveur. Raison : *${reason}*`);
        } catch (e) { return message.reply("❌ Impossible d'exclure ce membre."); }
    }

    // --- COMMANDE !MUTE (TIMEOUT) ---
    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply("❌ Tu n'as pas la permission de mute des membres.");
        }
        const target = message.mentions.members.first();
        if (!target) return message.reply("⚠️ Utilisation : `!mute @pseudo [minutes]`");
        
        let minutes = parseInt(args[1]);
        if (isNaN(minutes) || minutes < 1) minutes = 10; // 10 minutes par défaut si non spécifié

        try {
            await target.timeout(minutes * 60 * 1000, "Mute demandé via la commande !mute");
            return message.reply(`✅ **${target.user.username}** a été mute pendant **${minutes} minutes**.`);
        } catch (e) { return message.reply("❌ Impossible de mute ce membre."); }
    }

    // --- COMMANDE !SETUP-TICKET ---
    if (command === 'setup-ticket') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ Tu dois être administrateur pour configurer le système de ticket.");
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('📩 Ouvrir un ticket').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({
            content: "📩 **Besoin d'aide ou d'un entretien ?**\nCliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec le staff !",
            components: [row]
        });
        
        return message.delete().catch(() => null);
    }

    // --- COMMANDE !MOOV ---
    if (command === 'moov') {
        const targetMember = message.member;

        if (!targetMember.voice.channel || targetMember.voice.channel.id !== serverConfig.waitingVoiceId) {
            return message.reply(`⚠️ Tu dois être connecté dans le salon vocal d'attente (<#${serverConfig.waitingVoiceId}>) pour faire cette commande !`);
        }

        try {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ma_${targetMember.id}`).setLabel('🟢 Oui, accepter').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`md_${targetMember.id}`).setLabel('🔴 Non, refuser').setStyle(ButtonStyle.Danger)
            );

            const adminChannel = await message.guild.channels.fetch(serverConfig.adminTextId);
            if (adminChannel) {
                await adminChannel.send({ 
                    content: `🔔 <@&${serverConfig.staffRoleId}> | **${targetMember.user.username}** demande l'accès au salon privé !`, 
                    components: [row] 
                });

                return message.reply("✅ Ta demande a bien été envoyée. Reste bien dans le salon !");
            }
        } catch (err) {
            console.error(err);
            return message.reply("❌ Une erreur est survenue.");
        }
    }
});

client.on('error', console.error);

client.login(process.env.TOKEN);
