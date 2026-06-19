export const INDIAN_ESTIMATES = {
  transport: [
    { id: 'commute_car_petrol', label: 'Petrol Car', sub_type: 'commute_car_petrol', defaultQty: 15, unit: 'km', costProxy: 'petrol' },
    { id: 'car_diesel', label: 'Diesel Car', sub_type: 'car_diesel', defaultQty: 15, unit: 'km' },
    { id: 'commute_cng_car', label: 'CNG Car', sub_type: 'commute_cng_car', defaultQty: 15, unit: 'km', costProxy: 'cng' },
    { id: 'commute_bike_petrol', label: 'Motorcycle/Scooter', sub_type: 'commute_bike_petrol', defaultQty: 10, unit: 'km', costProxy: 'petrol_bike' },
    { id: 'commute_bus', label: 'City Bus', sub_type: 'commute_bus', defaultQty: 10, unit: 'km' },
    { id: 'commute_auto', label: 'Auto-rickshaw', sub_type: 'commute_auto', defaultQty: 5, unit: 'km' },
    { id: 'commute_cab', label: 'Cab / Taxi', sub_type: 'commute_cab', defaultQty: 10, unit: 'km' },
    { id: 'commute_metro', label: 'Metro / Local Train', sub_type: 'commute_metro', defaultQty: 12, unit: 'km' }
  ],
  energy: [
    { id: 'electricity_home', label: 'Home Electricity', sub_type: 'electricity_home', defaultQty: 10, unit: 'kWh', costProxy: 'electricity' },
    { id: 'lpg_cylinder', label: 'LPG Cylinder Refill', sub_type: 'lpg_cylinder', defaultQty: 1, unit: 'cylinder', costProxy: 'lpg' },
    { id: 'lpg_cooking', label: 'LPG Cooking Gas', sub_type: 'lpg_cooking', defaultQty: 2, unit: 'kg' }
  ],
  food: [
    { id: 'meal_veg', label: 'Veg Meal', sub_type: 'meal_veg', defaultQty: 1, unit: 'meal' },
    { id: 'meal_egg', label: 'Eggs / Dairy Meal', sub_type: 'meal_egg', defaultQty: 1, unit: 'meal' },
    { id: 'meal_chicken', label: 'Chicken Meal', sub_type: 'meal_chicken', defaultQty: 1, unit: 'meal' },
    { id: 'meal_beef_mutton', label: 'Mutton/Beef Meal', sub_type: 'meal_beef_mutton', defaultQty: 1, unit: 'meal' }
  ],
  consumption: [
    { id: 'online_shopping', label: 'Online Order', sub_type: 'online_shopping', defaultQty: 1, unit: 'order' },
    { id: 'general_waste', label: 'Household Waste', sub_type: 'general_waste', defaultQty: 5, unit: 'kg' }
  ]
};

export const COST_PROXIES = {
  petrol: {
    pricePerUnit: 106,
    mileage: 12.24,
    toQty: (cost) => (cost / 106) * 12.24,
    fromQty: (qty) => (qty / 12.24) * 106,
    costUnit: '₹'
  },
  petrol_bike: {
    pricePerUnit: 106,
    mileage: 40,
    toQty: (cost) => (cost / 106) * 40,
    fromQty: (qty) => (qty / 40) * 106,
    costUnit: '₹'
  },
  cng: {
    pricePerUnit: 80,
    mileage: 20,
    toQty: (cost) => (cost / 80) * 20,
    fromQty: (qty) => (qty / 20) * 80,
    costUnit: '₹'
  },
  electricity: {
    pricePerUnit: 7.5,
    toQty: (cost) => cost / 7.5,
    fromQty: (qty) => qty * 7.5,
    costUnit: '₹'
  },
  lpg: {
    pricePerUnit: 950,
    toQty: (cost) => cost / 950,
    fromQty: (qty) => qty * 950,
    costUnit: '₹'
  }
};
