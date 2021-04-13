import { BankPackName, IIndexedItem } from "../internal";

export interface IBankedItem extends IIndexedItem {
    bank: BankPackName
}