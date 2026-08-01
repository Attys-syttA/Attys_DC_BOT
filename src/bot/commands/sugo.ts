import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { commandAutocompleteChoices, renderHelpPages } from "./help-renderer.js";

export const data = new SlashCommandBuilder()
  .setName("sugo")
  .setDescription("Magyar sugo a bot parancsaihoz")
  .addStringOption((opt) =>
    opt
      .setName("parancs")
      .setDescription("Melyik parancsrol kersz reszletesebb sugot?")
      .setRequired(false)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await interaction.respond(commandAutocompleteChoices(interaction.options.getFocused()));
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const selected = interaction.options.getString("parancs", false);
  const pages = renderHelpPages(interaction.commandName, selected);
  await interaction.editReply({
    content: pages[0] ?? "",
  });
  for (const page of pages.slice(1)) {
    await interaction.followUp({ content: page });
  }
}
