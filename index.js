const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const express = require('express');

// --- SERVEUR POUR RENDER (STABLE) ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Seimi est en ligne et protège la zone !'));
app.listen(port, '0.0.0.0', () => console.log(`Serveur prêt sur le port ${port}`));

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

    // --- COMMANDE CLEAR ---
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply("Précise un chiffre entre 1 et 100.");
        await message.channel.bulkDelete(amount + 1, true);
        message.channel.send(`✅ ${amount} messages supprimés.`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // --- COMMANDE BAN (AVEC SÉCURITÉ) ---
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à bannir.");

        // SÉCURITÉ : Empêche un modérateur de s'auto-bannir (Règle de la Zone 3)
        if (member.id === message.author.id) {
            return message.reply("🛡️ **Seimi :** Tu ne peux pas t'auto-bannir. La zone a besoin de ses modérateurs !");
        }

        try {
            await member.ban();
            message.reply(`🚫 **${member.user.tag}** a été banni par Seimi.`);
        } catch (err) {
            message.reply("❌ Je n'ai pas pu bannir ce membre (Vérifie mes permissions ou sa hiérarchie).");
        }
    }

    // --- COMMANDE KICK ---
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à expulser.");
        if (member.id === message.author.id) return message.reply("Tu ne peux pas t'expulser toi-même.");
        
        await member.kick();
        message.reply(`👞 **${member.user.tag}** a été expulsé.`);
    }
});

client.login(process.env.TOKEN);
