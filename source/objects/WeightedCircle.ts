import { List, Point, Location, Player, Entity, CONSTANTS } from "../internal";

export class WeightedCircle extends List<{location: Location, weight: number}> {
    center: Location;
    radius: number;

    constructor(center: Location, radius: number, stepSize: number) {
        super();

        radius *= 1.5;

        this.center = center;
        this.radius = radius;

        stepSize = Math.ceil(stepSize * 1.5);

        let x1 = Math.ceil((center.x - radius) / stepSize);
        let x2 = Math.floor((center.x + radius) / stepSize);
        let radius2 = radius * radius;

        for (let i = x1; i <= x2; i++) {
            let x = i * stepSize;
            let newRadius = center.x - x;
            newRadius *= newRadius;
            newRadius = Math.floor(Math.sqrt(radius2 - newRadius));

            let y1 = Math.ceil((center.y - newRadius) / stepSize);
            let y2 = Math.floor((center.y + newRadius) / stepSize);

            for (let i2 = y1; i2 <= y2; i2++)
                this.add({location: new Location(new Point(x, i2 * stepSize), center.map), weight: 0})
        }
    }

    applyWeight(entities: List<Entity>, players: List<Player>, weightedCenter: Point, ignoreMonsters: boolean) {
        for(let entry of this) {
            let distanceFromCenter = entry.location.point.distance(this.center);
            let distanceToCurrent = entry.location.point.distance(weightedCenter);

            //WEIGHT: LOWER IS BETTER
            //closer points are better
            //mid-range gravity: points at mid-range are better to give more options for movement
            entry.weight += distanceToCurrent ** 2;
            entry.weight += (Math.abs(this.radius / 3) - distanceFromCenter) ** 2;

            if(!ignoreMonsters) {
                for (let entity of entities) {
                    if (entity == null)
                        continue;

                    let entityPoint = Point.fromIPosition(entity);
                    let distanceToEntity = entry.location.point.distance(entityPoint);
                    //this is the size of the effect
                    let range = Math.max(((entity.rage ? entity.range : (CONSTANTS.ENTITY_WIDTH)) + (entity.speed) + CONSTANTS.ENTITY_WIDTH) - distanceToEntity, 0);

                    //give this a high initial weight, so even the outer edges will push players around
                    entry.weight += (range + CONSTANTS.ENTITY_WIDTH) ** 3;                    
                }
            }

            for (let player of players) {
                if(player == null)
                    continue;

                let playerPoint = Point.fromIPosition(player);
                let distanceToPlayer = entry.location.distance(playerPoint);
                //we dont want to stand on anyone, but we do want to stand somewhat close to priests, so make the area around them safer
                let heuristicMax = player.ctype === "priest" ? -50 : 0;
                let heuristic = Math.max((CONSTANTS.PLAYER_WIDTH + (player.speed/5) - distanceToPlayer), heuristicMax);

                if(heuristic < 0)
                    //we reverse the heuristic here, because closer is better(as long as we arent standing on the priest)
                    entry.weight -= ((heuristicMax + heuristic) ** 2);
                else
                    entry.weight += (heuristic ** 2);
            }
        }
    }
}