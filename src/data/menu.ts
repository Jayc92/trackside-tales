import { Beer, FoodItem } from '../app/types';
import { CAN_IMAGES } from './canImages';

// ================== REGULAR BEERS ==================
export const LOCAL_REGULARS: Beer[] = [
  {
    name: 'Trackside Lager',
    abbr: 'TRACKSIDE',
    image: CAN_IMAGES.TRACKSIDE,
    style: 'American Lager',
    abv: '4.9%',
    ibu: '20',
    tasting: 'Our staple. Crisp, clean, sessionable — the beer every brewery needs to get right. This is ours.',
    tapStatus: 'on-tap',
  },
  {
    name: 'Bethlehem Steel Ale',
    abbr: 'STEEL ALE',
    image: CAN_IMAGES.BETHLEHEM,
    style: 'American Amber Ale',
    abv: '5.6%',
    ibu: '28',
    tasting: 'A tribute to the furnaces that built America. Rich caramel malt, medium body, hops that bite just enough.',
    tapStatus: 'on-tap',
  },
  {
    name: '610 Pilsner',
    abbr: '610',
    image: CAN_IMAGES.SIX10,
    style: 'Czech Pilsner',
    abv: '5.0%',
    ibu: '35',
    tasting: 'Named for the highway that cuts through the valley. Bohemian floor-malted pilsner, Saaz hops, a pour that honors the classics.',
    tapStatus: 'on-tap',
  },
];

// ================== NON-ALCOHOLIC BEERS ==================
export const LOCAL_NON_ALC: Beer[] = [
  {
    name: "Signalman's Citrus Wheat",
    abbr: 'SIGNALMAN',
    image: CAN_IMAGES.SIGNALMANS,
    style: 'Non-Alcoholic Wheat Ale',
    abv: '<0.5%',
    ibu: '12',
    tasting: 'For the designated drivers and the morning shifts. Bright citrus over soft wheat malt — refreshment without compromise.',
  },
  {
    name: 'Roundhouse Red',
    abbr: 'ROUNDHOUSE',
    image: CAN_IMAGES.ROUNDHOUSE,
    style: 'Non-Alcoholic Amber',
    abv: '<0.5%',
    ibu: '22',
    tasting: "All the caramel warmth of an amber ale, zero alcohol. Our answer to the question: why shouldn't everyone at the table drink well?",
  },
];

// ================== FOOD MENU ==================
export const LOCAL_FOOD: FoodItem[] = [
  {
    name: 'Other Side Of The Pillow',
    desc: 'Deep fried or sautéed house potato and Cooper cheese pierogies, caramelized onions, sour cream, red wine demi-glace.',
  },
  {
    name: 'CNJ Railyard',
    desc: 'Organic super greens, roasted red peppers, carrot ribbons, roasted grape tomatoes, shaved parmesan, balsamic honey vinaigrette.',
  },
  {
    name: 'Broad Street Bully',
    desc: 'Shaved ribeye, caramelized onions, Cooper Sharp, Egypt Star Bakery French bread.',
  },
  {
    name: 'Burger Flight',
    desc: 'Three sliders: Double Wide, Mule Kick, Smash Bros.',
  },
];
