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
    try {
        totalMembers = client.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);
    } catch (e) {
        totalMembers = "Indisponible";
    }
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
        return res.json({ success: true, message: "✅ Annonce brute diffusée avec mention @everyone !" });
    } catch (err) { return res.json({ success: false, message: `❌ Erreur : ${err.message}` }); }
});

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
    waitingVoiceId: "1468303822731612348", // Salon vocal d'attente
    privateVoiceId: "1498498611275895005", // Salon vocal privé
    adminTextId: "1515043230960324800",    // Salon textuel Moov
    staffRoleId: "1463629608518815804"      // Rôle Staff à ping
};

client.on('ready', () => console.log(`🤖 Seimi Engine connecté : ${client.user.tag}`));

client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get(serverConfig.welcomeRole) || member.guild.roles.cache.find(r => r.name === serverConfig.welcomeRole);
    if (role) try { await member.roles.add(role); } catch (e) {}
});

// GESTION DES BOUTONS ACCEPTER / REFUSER
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'btn_get_codes') {
        return interaction.reply({ embeds: [{
            color: 0x45f3ff, title: '🎮 CODES ROBLOX', description: `Espace des récompenses actives.`,
            fields: [{ name: '📌 Codes Actifs', value: '❌ *Aucun code promotionnel disponible.*' }]
        }], ephemeral: true });
    }

    if (interaction.customId.startsWith('ma_') || interaction.customId.startsWith('md_')) {
        // Sécurité : Seul le staff peut cliquer sur Accepter/Refuser
        if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            return interaction.reply({ content: "❌ Tu n'as pas la permission de valider cette demande.", ephemeral: true });
        }

        const parts = interaction.customId.split('_');
        const action = parts[0]; 
        const userId = parts[1];
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (!member) return interaction.update({ content: "❌ Le joueur a quitté le serveur Discord.", components: [] });

        // Bouton OUI (Accepter)
        if (action === 'ma') {
            if (!member.voice.channel || member.voice.channel.id !== serverConfig.waitingVoiceId) {
                return interaction.update({ content: `❌ **${member.user.username}** n'est plus dans le salon d'attente.`, components: [] });
            }
            try { 
                await member.voice.setChannel(serverConfig.privateVoiceId); 
                return interaction.update({ content: `🟢 **${member.user.username}** a été accepté et déplacé par ${interaction.user} !`, components: [] }); 
            } catch (e) { 
                return interaction.reply({ content: "❌ Impossible de déplacer le membre (problème de permissions).", ephemeral: true }); 
            }
        }

        // Bouton NON (Refuser)
        if (action === 'md') {
            return interaction.update({ content: `🔴 La demande d'accès pour **${member.user.username}** a été refusée par ${interaction.user}.`, components: [] });
        }
    }
});

// GESTION DES COMMANDES TEXTUELLES
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

    // --- LA COMMANDE !MOOV ENFIN IDENTIQUE À TES SOUVENIRS ---
    if (command === 'moov') {
        const targetMember = message.member; // C'est l'auteur du message qui fait sa demande !

        // 1. On vérifie s'il est bien dans le salon vocal d'attente
        if (!targetMember.voice.channel || targetMember.voice.channel.id !== serverConfig.waitingVoiceId) {
            return message.reply(`⚠️ Tu dois être connecté dans le salon vocal d'attente (<#${serverConfig.waitingVoiceId}>) pour faire cette commande !`);
        }

        try {
            // 2. On crée les boutons OUI / NON
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ma_${targetMember.id}`).setLabel('🟢 Oui, accepter').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`md_${targetMember.id}`).setLabel('🔴 Non, refuser').setStyle(ButtonStyle.Danger)
            );

            // 3. On récupère le salon textuel Moov
            const adminChannel = await message.guild.channels.fetch(serverConfig.adminTextId);
            if (adminChannel) {
                // On envoie la demande avec le PING de ton rôle Staff
                await adminChannel.send({ 
                    content: `🔔 <&${serverConfig.staffRoleId}> | **${targetMember.user.username}** demande l'accès au salon privé !`, 
                    components: [row] 
                });

                // Petit message de confirmation poli pour le joueur
                return message.reply("✅ Ta demande a bien été envoyée au staff. Reste bien dans le salon, ils vont te répondre !");
            }
        } catch (err) {
            console.error(err);
            return message.reply("❌ Une erreur est survenue lors de l'envoi de la demande.");
        }
    }
});

client.on('error', console.error);

client.login(process.env.TOKEN);
