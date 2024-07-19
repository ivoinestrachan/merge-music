require('dotenv').config();
const { Client, Intents, MessageEmbed } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, generateDependencyReport } = require('@discordjs/voice');
const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sodium = require('libsodium-wrappers');

(async () => {
  await sodium.ready;
  console.log('Sodium is ready');
  console.log(generateDependencyReport());

  const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_VOICE_STATES, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.MESSAGE_CONTENT] });

  const token = process.env.DISCORD_BOT_TOKEN;
  const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
  const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.REDIRECT_URI;

  const spotifyApi = new SpotifyWebApi({
    clientId: spotifyClientId,
    clientSecret: spotifyClientSecret,
    redirectUri: redirectUri
  });

  client.once('ready', () => {
    console.log('Bot is online!');
  });

  client.on('messageCreate', async message => {
    if (message.content.startsWith('!play')) {
      const query = message.content.replace('!play ', '');

      if (message.member.voice.channel) {
        const connection = joinVoiceChannel({
          channelId: message.member.voice.channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        try {
          const data = await spotifyApi.searchTracks(query);
          const track = data.body.tracks.items[0];
          const previewUrl = track.preview_url;

          const embed = new MessageEmbed()
            .setColor('#1DB954')
            .setTitle(track.name)
            .setURL(track.external_urls.spotify)
            .setAuthor(track.artists[0].name)
            .setDescription(`Click the title to listen on Spotify.`)
            .setThumbnail(track.album.images[0].url);

          message.channel.send({ embeds: [embed] });

          if (previewUrl) {
            const response = await axios({
              method: 'get',
              url: previewUrl,
              responseType: 'stream'
            });

            const filePath = path.join(__dirname, 'temp.mp3');
            const writer = fs.createWriteStream(filePath);

            response.data.pipe(writer);

            writer.on('finish', () => {
              const player = createAudioPlayer();
              const resource = createAudioResource(filePath);
              player.play(resource);

              connection.subscribe(player);

              player.on(AudioPlayerStatus.Playing, () => {
                console.log('the audio player has started playing!');
              });

              player.on('error', error => {
                console.error('Error:', error.message, 'with track', error.resource.metadata.title);
              });

              player.on(AudioPlayerStatus.Idle, () => {
                fs.unlink(filePath, (err) => {
                  if (err) console.error(err);
                });
              });
            });

            writer.on('error', (err) => {
              console.error('Error writing file:', err);
            });
          } else {
            message.channel.send(`Cannot play: ${track.name} by ${track.artists[0].name}.`);
          }
        } catch (err) {
          console.error(err);
          message.channel.send('Could not find the track.');
        }
      } else {
        message.reply('You need to join a voice channel first!');
      }
    }
  });

  client.login(token);

  spotifyApi.clientCredentialsGrant().then(
    err => {
      console.log('didnt recieve access token', err);
    }
  );
})();
