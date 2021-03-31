import { List, Utility, SETTINGS, Point, Location, Player, Entity, CONSTANTS } from "../internal";

export class WeightedCircle extends List<{location: Location, weight: number}> {
    center: Location;
    radius: number;

    constructor(center: Location, radius: number, step_size: number) {
        super();
        this.center = center;
        this.radius = radius;

        step_size = Math.ceil(step_size);

        let x1 = Math.ceil((center.x - radius) / step_size);
        let x2 = Math.floor((center.x + radius) / step_size);
        let radius2 = radius * radius;

        for (let i = x1; i <= x2; i++) {
            let x = i * step_size;
            let new_radius = center.x - x;
            new_radius *= new_radius;
            new_radius = Math.floor(Math.sqrt(radius2 - new_radius));

            let y1 = Math.ceil((center.y - new_radius) / step_size);
            let y2 = Math.floor((center.y + new_radius) / step_size);

            for (let i2 = y1; i2 <= y2; i2++)
                this.add({location: new Location(new Point(x, i2 * step_size), center.map), weight: 0})
        }
    }

    applyWeight(entities: List<Entity>, players: List<Player>, weightedCenter: Point) {
        for(let entry of this) {
            let distance_from_center = entry.location.point.distance(this.center);
            let distance_to_current = entry.location.point.distance(weightedCenter);

            //WEIGHT: LOWER IS BETTER
            //closer points are better
            //mid-range gravity: points at mid-range are better to give more options for movement
            entry.weight += distance_to_current ** 2;
            entry.weight += (Math.abs(this.radius / 2.5) - distance_from_center) ** 2;

            for (let entity of entities) {
                if (entity == null)
                    continue;

                let entityPoint = Utility.getPoint(entity);
                let distance_to_entity = entry.location.point.distance(entityPoint);
                let range = Math.max((entity.range * entity.aggro + entity.speed) - distance_to_entity, 0);

                entry.weight += range ** 5;                    
            }

            for (let player of players) {
                if(player == null)
                    continue;

                let player_point = Utility.getPoint(player);
                let distance_to_player = entry.location.distance(player_point);

                entry.weight += Math.max((CONSTANTS.PLAYER_WIDTH + (player.speed/5) - distance_to_player), 0) ** 2;
            }
        }
    }
}