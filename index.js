const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');

// --- SERVEUR POUR RENDER ---
const app = express();
app.get('/', (req, res) => res.send('Le Bot de la Zone 5 est actif !'));
app.listen(10000, () => console.log('Serveur HTTP prêt sur le port 10000'));

// --- CONFIGURATION DU BOT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const PREFIX = "!";

client.on('messageCreate', async (message) => {
    if (!message.content.startsWith(PREFIX) || message.author.bot) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // --- COMMANDES DE MODÉRATION ---

    // !clear [1-100]
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Précise un chiffre entre 1 et 100.");
        
        await message.channel.bulkDelete(amount + 1, true);
        message.channel.send(`✅ ${amount} messages supprimés.`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // !kick @membre
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à expulser.");
        await member.kick();
        message.reply(`👞 **${member.user.tag}** a été expulsé.`);
    }

    // !ban @membre
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à bannir.");
        await member.ban();
        message.reply(`🚫 **${member.user.tag}** a été banni.`);
    }

    // !timeout @membre [min]
    if (command === 'timeout') {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const member = message.mentions.members.first();
        const duration = parseInt(args[1]);
        if (!member || isNaN(duration)) return message.reply("Usage: !timeout @membre [minutes]");
        
        await member.timeout(duration * 60 * 1000);
        message.reply(`⏳ **${member.user.tag}** est en sourdine pour ${duration} minutes.`);
    }
});

client.login(process.env.TOKEN);
