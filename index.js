const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
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

const PREFIX = "!"; 

client.on('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- COMMANDE : !STAFF / !HELP ---
    if (command === 'staff' || command === 'help') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("⚠️ Accès réservé au personnel modérateur.");
        }

        const staffEmbed = {
            color: 0x0099ff,
            title: '🛠️ GUIDE MODÉRATION - SEIMI BOT',
            description: 'Liste des commandes disponibles pour le personnel.',
            fields: [
                { name: '🧹 !clear [1-100]', value: 'Nettoie les messages récents.' },
                { name: '👞 !kick @membre', value: 'Expulse un utilisateur.' },
                { name: '🚫 !ban @membre', value: 'Bannit un membre (confirmation requise).' },
                { name: '🤐 !mute @membre [temps]', value: 'Exclut : 1m, 5m, 10m, 30m, 1h.' },
                { name: '🔊 !unmute @membre', value: 'Retire l\'exclusion d\'un membre.' },
            ],
            footer: { text: 'Système Chroniques de la Zone 5' },
            timestamp: new Date(),
        };
        return message.channel.send({ embeds: [staffEmbed] });
    }

    // --- COMMANDE : !MUTE (Timeout) ---
    if (command === 'mute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

        const member = message.mentions.members.first();
        const duration = args[1]; // Ex: 1m, 5m, 10m, 30m, 1h

        if (!member) return message.reply("Mentionne un membre à réduire au silence.");
        if (member.id === message.author.id) return message.reply("Tu ne peux pas te mute toi-même.");

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
            message.reply("❌ Je n'ai pas les permissions de mute ce membre.");
        }
    }

    // --- COMMANDE : !UNMUTE / !DEMUTE ---
    if (command === 'unmute' || command === 'demute') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;

        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à démuter.");

        try {
            await member.timeout(null);
            message.channel.send(`🔊 **${member.user.tag}** peut à nouveau parler.`);
        } catch (err) {
            message.reply("❌ Impossible de retirer le mute de ce membre.");
        }
    }

    // --- COMMANDE : !CLEAR ---
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        let amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Précise un chiffre entre 1 et 100.");
        
        try {
            const deleted = await message.channel.bulkDelete(amount, true);
            message.channel.send(`✅ **${deleted.size}** messages supprimés.`).then(m => setTimeout(() => m.delete(), 3000));
        } catch (err) { message.reply("❌ Erreur lors de la suppression."); }
    }

    // --- COMMANDE : !KICK ---
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
        const member = message.mentions.members.first();
        if (!member || member.id === message.author.id) return;
        await member.kick();
        message.reply(`👞 **${member.user.tag}** a été expulsé.`);
    }

    // --- COMMANDE : !BAN ---
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        const member = message.mentions.members.first();
        if (!member || member.id === message.author.id) return;

        message.reply(`⚠️ Confirme le bannissement de **${member.user.tag}** ? (oui/non)`);
        const filter = m => m.author.id === message.author.id && ['oui', 'non'].includes(m.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000 });
            if (collected.first().content.toLowerCase() === 'oui') {
                await member.ban();
                message.channel.send(`🚫 **${member.user.tag}** a été banni.`);
            } else { message.channel.send("✅ Annulé."); }
        } catch (err) { message.channel.send("⌛ Expiré."); }
    }
});

client.login(process.env.TOKEN);
