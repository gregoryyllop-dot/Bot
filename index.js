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

// Clés d'accès sécurisées (Propriétaire & Modérateur)
const ADMIN_PIN = "06122023A"; 
const MOD_PIN = "Pupu1901";

// Vérification de la validité du PIN fourni
function isValidPin(pin) {
    return pin === ADMIN_PIN || pin === MOD_PIN;
}

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

// API pour envoyer les logs et la liste dynamique des salons textuels
app.get('/api/logs', async (req, res) => {
    let totalMembers = 0;
    let textChannels = [];
    
    try { 
        totalMembers = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0); 
        
        // On récupère tous les salons textuels accessibles par le bot
        const guild = client.guilds.cache.first(); // Prend le premier serveur où est le bot
        if (guild) {
            textChannels = guild.channels.cache
                .filter(c => c.type === ChannelType.GuildText)
                .map(c => ({ id: c.id, name: c.name }));
        }
    } catch (e) { 
        totalMembers = "Indisponible"; 
    }
    
    res.json({ 
        commands: commandLogs, 
        visitors: visitorLogs, 
        memberCount: totalMembers,
        channels: textChannels 
    });
});

app.post('/api/admin/annonce', async (req, res) => {
    const { pin, channelId, text } = req.body;
    if (!isValidPin(pin)) return res.status(403).json({ success: false, message: "❌ PIN invalide." });
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return res.json({ success: false, message: "❌ Salon introuvable." });
        await channel.send({ content: `📢 @everyone\n\n${text}` });
        logCommand(pin === ADMIN_PIN ? "Admin Web" : "Modérateur Web", `Annonce brute diffusée dans #${channel.name}`);
        return res.json({ success: true, message: "✅ Annonce brute diffusée !" });
    } catch (err) { return res.json({ success: false, message: `❌ Erreur : ${err.message}` }); }
});

app.post('/api/admin/clear', async (req, res) => {
    const { pin, channelId, amount } = req.body;
    if (!isValidPin(pin)) return res.status(403).json({ success: false, message: "❌ PIN invalide." });
    const limit = amount && amount <= 100 ? amount : 20;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return res.json({ success: false, message: "❌ Salon invalide." });
        await channel.bulkDelete(limit, true);
        logCommand(pin === ADMIN_PIN ? "Admin Web" : "Modérateur Web", `Purge (${limit} msgs) dans #${channel.name}`);
        return res.json({ success: true, message: `✅ Salon #${channel.name} nettoyé !` });
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

            // Liste des rôles Modos à pinger à l'ouverture du ticket
            const rolesToPing = [
                '1463629608518815804', // Fondateur
                '1465006719762567320', // Le fatigué
                '1463630196447117372'  // Modo punisher
            ];
            const pingString = rolesToPing.map(roleId => `<@&${roleId}>`).join(' ');

            await ticketChannel.send({ 
                content: `👋 Bienvenue dans ton ticket ${member} !\n🔔 Notification Staff : ${pingString}`, 
                components: [closeRow] 
            });

            return interaction.editReply({ content: `✅ Ton ticket a été créé avec succès : ${ticketChannel}` });
        } catch (e) { 
            console.error(e);
            return interaction.editReply({ content: "❌ Impossible de créer le ticket." }); 
        }
    }

    if (interaction.customId === 'btn_close_ticket') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return interaction.reply({ content: "❌ Seul le staff peut fermer ce ticket.", ephemeral: true });
        }
        await interaction.reply({ content: "🔒 Archivage et suppression du ticket dans 5 secondes..." });
        setTimeout(async () => { try { await interaction.channel.delete(); } catch(e) {} }, 5000);
        return;
    }

    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return interaction.reply({ content: "❌ Tu n'as pas la permission.", ephemeral: true });
        }

        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const userId = parts[1];
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (!member) return interaction.update({ content: "❌ Le joueur a quitté le serveur Discord.", components: [] });

        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) {
                return interaction.update({ content: `❌ **${member.user.username}** n'est plus en attente.`, components: [] });
            }
            try { 
                await member.voice.setChannel(serverConfig.privateVoiceId); 
                return interaction.update({ content: `🟢 **${member.user.username}** a été accepté et déplacé par ${interaction.user.username} !`, components: [] }); 
            } catch (e) { return interaction.reply({ content: "❌ Échec du déplacement.", ephemeral: true }); }
        }

        if (action === 'md') {
            return interaction.update({ content: `🔴 La demande pour **${member.user.username}** a été refusée par ${interaction.user.username}.`, components: [] });
        }
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

    if (command === 'codes' || command === 'roblox') {
        return message.reply({ embeds: [{
            color: 0x9d4edd, 
            title: '🎮 CODES ROBLOX', 
            description: `Espace des récompenses actives.`,
            fields: [{ name: '📌 Codes Actifs', value: '❌ *Aucun code promotionnel disponible pour le moment.*' }]
        }] });
    }

    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        const target = message.mentions.members.first(); if (!target || !target.bannable) return;
        const reason = args.slice(1).join(" ") || "Aucune raison";
        try { await target.ban({ reason }); message.reply(`✅ **${target.user.username}** banni.`); } catch (e) {}
    }

    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
        const target = message.mentions.members.first(); if (!target || !target.kickable) return;
        const reason = args.slice(1).join(" ") || "Aucune raison";
        try { await target.kick(reason); message.reply(`✅ **${target.user.username}** exclu.`); } catch (e) {}
    }

    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const target = message.mentions.members.first(); if (!target) return;
        let minutes = parseInt(args[1]) || 10;
        try { await target.timeout(minutes * 60 * 1000); message.reply(`✅ **${target.user.username}** mute ${minutes}m.`); } catch (e) {}
    }

    if (command === 'setup-ticket') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('📩 Ouvrir un ticket').setStyle(ButtonStyle.Primary));
        await message.channel.send({ content: "📩 **Besoin d'aide ?**\nCliquez ci-dessous pour ouvrir un ticket privé !", components: [row] });
        return message.delete().catch(() => null);
    }

    if (command === 'moov') {
        const targetMember = message.member;
        if (!targetMember.voice.channel || targetMember.voice.channel.id !== serverConfig.waitingVoiceId) return;
        try {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ma_${targetMember.id}`).setLabel('🟢 Oui, accepter').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`md_${targetMember.id}`).setLabel('🔴 Non, refuser').setStyle(ButtonStyle.Danger)
            );
            const adminChannel = await message.guild.channels.fetch(serverConfig.adminTextId);
            if (adminChannel) {
                await adminChannel.send({ content: `🔔 **Staff** | **${targetMember.user.username}** demande l'accès !`, components: [row] });
                return message.reply("✅ Demande envoyée !");
            }
        } catch (err) {}
    }
});

client.on('error', console.error);
client.login(process.env.TOKEN);
