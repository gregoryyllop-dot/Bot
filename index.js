const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const express = require('express');

// --- 1. CONFIGURATION DU SERVEUR POUR RENDER ---
const app = express();
const port = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Seimi est en ligne et protège la zone !'));
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

    // --- COMMANDE : !CLEAR (Jusqu'à 100 messages) ---
    if (command === 'clear') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
        
        let amount = parseInt(args[0]);
        // Correction de la limite : Discord accepte 100 maximum
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply("Précise un chiffre entre 1 et 100.");
        }
        
        try {
            // Suppression directe sans le "+1" pour éviter l'erreur des 101 messages
            const deleted = await message.channel.bulkDelete(amount, true);
            message.channel.send(`✅ **${deleted.size}** messages supprimés par Seimi.`)
                .then(m => setTimeout(() => m.delete(), 3000));
        } catch (err) {
            message.reply("❌ Impossible de supprimer des messages de plus de 14 jours.");
        }
    }

    // --- COMMANDE : !KICK ---
    if (command === 'kick') {
        if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à expulser.");
        if (member.id === message.author.id) return message.reply("🛡️ Tu ne peux pas t'expulser toi-même.");

        await member.kick();
        message.reply(`👞 **${member.user.tag}** a été expulsé.`);
    }

    // --- COMMANDE : !BAN (AVEC SÉCURITÉ ET CONFIRMATION) ---
    if (command === 'ban') {
        if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) return;
        
        const member = message.mentions.members.first();
        if (!member) return message.reply("Mentionne un membre à bannir.");

        // SÉCURITÉ : Un membre ne peut pas se bannir lui-même [cite: 2026-01-22]
        if (member.id === message.author.id) {
            return message.reply("🛡️ **Seimi :** Un modérateur ne peut pas s'auto-bannir !");
        }

        message.reply(`⚠️ Confirme-tu le bannissement de **${member.user.tag}** ? Réponds par **oui** ou **non**.`);

        const filter = m => m.author.id === message.author.id && ['oui', 'non'].includes(m.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000, errors: ['time'] });
            const response = collected.first().content.toLowerCase();

            if (response === 'oui') {
                await member.ban();
                message.channel.send(`🚫 **${member.user.tag}** a été banni par Seimi.`);
            } else {
                message.channel.send("✅ Bannissement annulé.");
            }
        } catch (err) {
            message.channel.send("⌛ Temps écoulé, action annulée.");
        }
    }
});

client.login(process.env.TOKEN);
