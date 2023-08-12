import { AutocompleteInteraction } from "discord.js";

import { djosu } from "../..";

export async function handleMusicSkip(command: AutocompleteInteraction) {
	if (command.commandName != "skip" || !command.guildId) return;

	const position = command.options.getString("posicao", true);

	const guildQueue = djosu.queues.getQueue(command.guildId);

	if (!guildQueue) return;

	const results = guildQueue
		.getSongs()
		.filter(
			(song) =>
				song.title.toLowerCase().includes(position) ||
				song.title.toLowerCase().startsWith(position)
		);

	results.splice(24, 999);

	command.respond(
		results.map((song) => {
			return {
				name: song.title,
				value: `position,${String(
					guildQueue.findSongIndexById(song.id)
				)}`,
			};
		})
	);
}
