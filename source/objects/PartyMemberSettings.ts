import { CharacterType, ItemName, List, MapName, MonsterName } from "../internal";

export interface PartyMemberSettings {
    class: CharacterType;
    elixir: ItemName;
    assist?: string;
    attackMTypes?: List<MonsterName>;
    map?: MapName;
}