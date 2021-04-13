import { DateExt, Dictionary, Game, IQuestData, List, MapName, MonsterName, NodeData, NPCName, Pathfinder, SETTINGS } from "../internal";

export class Data {
    static quests: Dictionary<string, IQuestData>;
    static bossHunt: Dictionary<MonsterName, DateExt>;


    static populate() {
        this.quests = new Dictionary();
        this.bossHunt = new Dictionary();

        for(let npc of Object.values(Game.G.npcs)) {
            if(npc.quest) {
                let npcLoc = this.locateNPCs(npc.id)?.[0];
                if(npcLoc)
                    this.quests.addOrSet(npc.quest, { x: npcLoc.x, y: npcLoc.y, map: npcLoc.map, in: npcLoc.map, id: npc.id });
            }
        }
    }

    private static locateNPCs(npcID: NPCName): NodeData[] {
        const locations: NodeData[] = []
        for (const mapName in Game.G.maps) {
            const map = Game.G.maps[mapName as MapName]!;
            if (map.ignore)
                continue
            if (map.instance || !map.npcs || map.npcs.length == 0)
                continue // Map is unreachable, or there are no NPCs

            for (const npc of map.npcs) {
                if (npc.id !== npcID)
                    continue

                // TODO: If it's an NPC that moves around, check in the database for the latest location
                if (npc.position) {
                    locations.push({ map: mapName as MapName, x: npc.position[0], y: npc.position[1] })
                } else if (npc.positions) {
                    for (const position of npc.positions) {
                        locations.push({ map: mapName as MapName, x: position[0], y: position[1] })
                    }
                }
            }
        }

        return locations
    }
}