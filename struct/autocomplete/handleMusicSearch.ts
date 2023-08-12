import { AutocompleteInteraction } from "discord.js";
import { searchVideo } from "usetube";
import timeString from "../../utils/transformers/timeString";
import truncateString from "../../utils/transformers/truncateString";

export async function handleMusicSearch(command: AutocompleteInteraction) {
	if (command.commandName != "play") return;

	const search = command.options.getString("link_ou_nome", true);

	const result = await searchVideo(search);

	result.videos.slice(24, 9999);

	command.respond(
		result.videos.map((video) => {
			return {
				name: truncateString(
					`${video.title}`,
					100 - ` [${timeString(video.duration)}]`.length
				).concat(` [${timeString(video.duration)}]`),
				value: `https://youtube.com/watch?v=${video.id}`,
			};
		})
	);
}
