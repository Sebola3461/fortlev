import { AttachmentBuilder, SlashCommandStringOption } from "discord.js";
import { getVideoMP3Binary } from "yt-get";

import { SlashCommand } from "../struct/commands/SlashCommand";
import { errorEmbed } from "../utils/embeds/errorEmbed";

export default new SlashCommand()
	.setName("baixar")
	.setDescription("Baixa uma musica")
	.addOptions(
		new SlashCommandStringOption()
			.setName("link")
			.setDescription("Link da musica")
			.setRequired(true)
	)
	.setExecutable(async (command) => {
		try {
			if (!command.member) return;

			const musica = command.options.getString("link", true);

			const url = new URL(musica);

			const videoId = url.href;

			queueVideo(videoId);

			async function queueVideo(videoId: string) {
				const mp3 = await getVideoMP3Binary(videoId);

				const attachment = new AttachmentBuilder(mp3.mp3, {
					name: `${mp3.title}.mp3`,
				});

				return command.editReply({
					files: [attachment],
				});
			}
		} catch (e) {
			console.error(e);

			errorEmbed(command.editReply.bind(command), {
				description: "Deu certo nao",
			});
		}
	});
