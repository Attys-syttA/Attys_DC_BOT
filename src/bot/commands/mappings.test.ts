import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Project } from "../../db/types.js";

const mocks = vi.hoisted(() => ({
  getAllProjects: vi.fn(),
}));

vi.mock("../../db/database.js", () => ({
  getAllProjects: mocks.getAllProjects,
}));

import { execute, renderMappingComponents, renderMappingFields } from "./mappings.js";

function project(channelId: string, projectPath: string, autoApprove = 0): Project {
  return {
    channel_id: channelId,
    project_path: projectPath,
    guild_id: "guild-id",
    auto_approve: autoApprove,
    created_at: "now",
  };
}

function makeInteraction() {
  return {
    guildId: "guild-id",
    editReply: vi.fn(),
  };
}

describe("/mappings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAllProjects.mockReturnValue([]);
  });

  it("reports when no mappings exist", async () => {
    const interaction = makeInteraction();

    await execute(interaction as never);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: "No project-channel mappings registered. Use `/register` first.",
    });
  });

  it("lists mapping totals and duplicate groups", async () => {
    mocks.getAllProjects.mockReturnValue([
      project("current-channel", "/projects/app"),
      project("legacy-forum", "/projects/app"),
      project("other-channel", "/projects/other"),
    ]);
    const interaction = makeInteraction();

    await execute(interaction as never);

    const embed = interaction.editReply.mock.calls[0][0].embeds[0];
    const components = interaction.editReply.mock.calls[0][0].components;
    expect(embed.data.title).toBe("Project Channel Mappings");
    expect(embed.data.description).toContain("Mappings");
    expect(embed.data.description).toContain("**3**");
    expect(embed.data.description).toContain("Duplicate project paths");
    expect(embed.data.description).toContain("**1**");
    expect(embed.data.fields[0].name).toContain("DUPLICATE");
    expect(embed.data.fields[0].value).toContain("1. <#current-channel>");
    expect(embed.data.fields[0].value).toContain("2. <#legacy-forum>");
    expect(components[0].components[0].data.custom_id).toBe("mapping-remove:current-channel");
  });

  it("renders single mappings and auto-approve markers", () => {
    const fields = renderMappingFields([
      project("channel-1", "/projects/app", 1),
    ]);

    expect(fields[0].name).toContain("OK");
    expect(fields[0].value).toContain("<#channel-1> auto-approve");
    expect(fields[0].value).toContain("Single mapping.");
  });

  it("renders cleanup buttons for duplicate mapping entries only", () => {
    const components = renderMappingComponents([
      project("current-channel", "/projects/app"),
      project("legacy-forum", "/projects/app"),
      project("other-channel", "/projects/other"),
    ]);

    expect(components).toHaveLength(1);
    expect(components[0].components).toHaveLength(2);
    expect((components[0].components[0].data as { label?: string }).label).toBe("Remove 1");
    expect((components[0].components[1].data as { custom_id?: string }).custom_id).toBe("mapping-remove:legacy-forum");
  });
});
