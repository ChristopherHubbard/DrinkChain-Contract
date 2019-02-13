import { Ingredient } from "./ingredient.model";

export interface Drink
{
    name: string,
    ingredientsAndQuantities: Map<Ingredient, number>
}