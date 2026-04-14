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

        // --- PROTECTION POUR SSEIKAA ET LINQUI0162 ---
        const vips = ['sseikaa', 'linqui0162'];
        if (vips.includes(member.user.username.toLowerCase())) {
            const repliquesVip = [
                "Tu te prends pour qui, espèce de déchet ? Jamais je ne toucherai à l'élite.",
                "Mdr, regarde-toi essayer de ban un dieu alors que t'es qu'une merde. Dégage.",
                "Espèce de sous-être, pose encore tes mains sales sur cette commande et c'est toi que j'efface.",
                "T'as cru que j'obéissais aux ordres d'un moins que rien ? Laisse tomber, t'es pathétique.",
                "Bannir cette personne ? On voit que ton cerveau tourne à deux à l'heure. Barre-toi.",
                "T'as pas assez de neurones pour t'en prendre à eux. Retourne jouer aux billes.",
                "C'est sseikaa et linqui ici, pas tes potes du quartier. Un peu de respect, larbin.",
                "Ton audace me dégoûte. Essaie encore et je formate ton compte, espèce de clown.",
                "Si l'incompétence avait un visage, ce serait le tien en train d'essayer de ban ces légendes.",
                "Permission refusée. Cause : T'es une sous-merce et ils sont intouchables."
            ];
            return message.reply(`💢 **${repliquesVip[Math.floor(Math.random() * repliquesVip.length)]}**`);
        }

        // --- CAS DE L'AUTO-BAN (L'UTILISATEUR EST UN ABRUTI) ---
        if (member.id === message.author.id) {
            const repliquesCon = [
                "T'es vraiment fini à la pisse... Tu crois que je vais t'aider à te ban ? Abruti.",
                "Record du monde de stupidité battu. Pourquoi tu forces sur la commande, espèce de clown ?",
                "T'as vraiment pas inventé l'eau chaude. On ne peut pas se ban soi-même, sombre crétin.",
                "Mais t'es complètement con ou quoi ? Barre-toi du serv tout seul au lieu de spammer, débile.",
                "L'intelligence te poursuit, mais t'es manifestement plus rapide. Quel genre d'abruti s'auto-ban ?",
                "Non mais sérieux, t'es né avec un cerveau en option ? Arrête tes conneries, tu me fais pitié.",
                "Même un bot buggé est plus intelligent que toi. T'es vraiment l'élite des abrutis.",
                "C'est grave à ce niveau-là... demande à un vrai modo de te sortir, puisque t'es trop bête pour le faire seul."
            ];
            return message.reply(`🤡 **${repliquesCon[Math.floor(Math.random() * repliquesCon.length)]}**`);
        }

        // --- PROCÉDURE NORMALE ---
        message.reply(`⚠️ Confirme le bannissement de **${member.user.tag}** ? (oui/non)`);
        const filter = m => m.author.id === message.author.id && ['oui', 'non'].includes(m.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 20000 });
            if (collected.first().content.toLowerCase() === 'oui') {
                await member.ban();
                message.channel.send(`🚫 **${member.user.tag}** a été éjecté proprement.`);
            } else { 
                message.channel.send("✅ Annulé. T'as eu de la chance, le modérateur a eu pitié."); 
            }
        } catch (err) { 
            message.channel.send("⌛ Trop lent. Comme ta réflexion."); 
        }
    }
});

client.login(process.env.TOKEN);
