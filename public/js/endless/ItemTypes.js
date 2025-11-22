/**
 * Item Types for Endless Sea of Rooms
 * Defines all collectible items, their categories, and properties
 */

const ITEM_CATEGORIES = {
    FOOD: 'food',
    WATER: 'water',
    MATERIAL: 'material'
};

const ITEM_TYPES = {
    // Fish - common
    FISH_COMMON: {
        id: 'fish_common',
        name: 'Common Fish',
        category: ITEM_CATEGORIES.FOOD,
        value: 1,
        sprite: 'fish_common',
        nutrition: 15,
        needsCooking: true
    },
    FISH_MEDIUM: {
        id: 'fish_medium',
        name: 'Medium Fish',
        category: ITEM_CATEGORIES.FOOD,
        value: 2,
        sprite: 'fish_medium',
        nutrition: 25,
        needsCooking: true
    },
    FISH_RARE: {
        id: 'fish_rare',
        name: 'Rare Fish',
        category: ITEM_CATEGORIES.FOOD,
        value: 4,
        sprite: 'fish_rare',
        nutrition: 40,
        needsCooking: true
    },
    FISH_LEGENDARY: {
        id: 'fish_legendary',
        name: 'Legendary Fish',
        category: ITEM_CATEGORIES.FOOD,
        value: 8,
        sprite: 'fish_legendary',
        nutrition: 60,
        needsCooking: true
    },

    // Cooked fish
    FISH_COOKED: {
        id: 'fish_cooked',
        name: 'Cooked Fish',
        category: ITEM_CATEGORIES.FOOD,
        value: 3,
        sprite: 'fish_cooked',
        nutrition: 30,
        needsCooking: false
    },

    // Water
    WATER_DIRTY: {
        id: 'water_dirty',
        name: 'Dirty Water',
        category: ITEM_CATEGORIES.WATER,
        value: 1,
        sprite: 'water_dirty',
        hydration: 10,
        needsPurify: true
    },
    WATER_CLEAN: {
        id: 'water_clean',
        name: 'Clean Water',
        category: ITEM_CATEGORIES.WATER,
        value: 2,
        sprite: 'water_clean',
        hydration: 25,
        needsPurify: false
    },

    // Trash/Materials
    TRASH_BOOT: {
        id: 'trash_boot',
        name: 'Old Boot',
        category: ITEM_CATEGORIES.MATERIAL,
        value: 0.5,
        sprite: 'boot'
    },
    TRASH_BOTTLE: {
        id: 'trash_bottle',
        name: 'Bottle',
        category: ITEM_CATEGORIES.MATERIAL,
        value: 1,
        sprite: 'bottle'
    },
    WOOD: {
        id: 'wood',
        name: 'Wood Plank',
        category: ITEM_CATEGORIES.MATERIAL,
        value: 2,
        sprite: 'wood'
    },
    CLOTH: {
        id: 'cloth',
        name: 'Cloth',
        category: ITEM_CATEGORIES.MATERIAL,
        value: 1.5,
        sprite: 'cloth'
    },
    METAL: {
        id: 'metal',
        name: 'Scrap Metal',
        category: ITEM_CATEGORIES.MATERIAL,
        value: 3,
        sprite: 'metal'
    }
};

// Loot tables for fishing
const FISHING_LOOT_TABLE = [
    { item: ITEM_TYPES.FISH_COMMON, weight: 50 },
    { item: ITEM_TYPES.FISH_MEDIUM, weight: 25 },
    { item: ITEM_TYPES.FISH_RARE, weight: 10 },
    { item: ITEM_TYPES.FISH_LEGENDARY, weight: 2 },
    { item: ITEM_TYPES.TRASH_BOOT, weight: 5 },
    { item: ITEM_TYPES.TRASH_BOTTLE, weight: 5 },
    { item: ITEM_TYPES.WATER_DIRTY, weight: 3 }
];

// Loot table for chests
const CHEST_LOOT_TABLE = [
    { item: ITEM_TYPES.FISH_RARE, weight: 20 },
    { item: ITEM_TYPES.FISH_LEGENDARY, weight: 10 },
    { item: ITEM_TYPES.WATER_CLEAN, weight: 25 },
    { item: ITEM_TYPES.WOOD, weight: 20 },
    { item: ITEM_TYPES.CLOTH, weight: 15 },
    { item: ITEM_TYPES.METAL, weight: 10 }
];

/**
 * Get random item from loot table
 * @param {Array} lootTable - Array of {item, weight} objects
 * @returns {Object} Selected item type
 */
function getRandomLoot(lootTable) {
    const totalWeight = lootTable.reduce((sum, entry) => sum + entry.weight, 0);
    let random = Math.random() * totalWeight;

    for (const entry of lootTable) {
        random -= entry.weight;
        if (random <= 0) {
            return { ...entry.item }; // Return copy
        }
    }

    return { ...lootTable[0].item };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ITEM_CATEGORIES,
        ITEM_TYPES,
        FISHING_LOOT_TABLE,
        CHEST_LOOT_TABLE,
        getRandomLoot
    };
}
