export const OTHER_MAKE = 'Other';
export const OTHER_MODEL = 'Other';

export const VEHICLE_MAKES: Record<string, string[]> = {
  Toyota: [
    'Corolla', 'Camry', 'RAV4', 'Hilux', 'Land Cruiser', 'Prado', 'Yaris', 'Aqua', 'Prius',
    'Highlander', 'Fortuner', 'C-HR', '86', 'Supra', 'HiAce', 'Estima', 'Alphard', OTHER_MODEL,
  ],
  Honda: [
    'Civic', 'Accord', 'CR-V', 'HR-V', 'Jazz', 'Fit', 'Odyssey', 'City', 'Pilot', 'NSX', OTHER_MODEL,
  ],
  Mazda: [
    'Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-8', 'CX-9', 'CX-30', 'MX-5', 'BT-50', OTHER_MODEL,
  ],
  Nissan: [
    'Micra', 'Pulsar', 'Altima', 'Qashqai', 'X-Trail', 'Navara', 'Patrol', 'Leaf', 'Juke', 'Pathfinder', OTHER_MODEL,
  ],
  Mitsubishi: [
    'Mirage', 'Lancer', 'Outlander', 'ASX', 'Pajero', 'Triton', 'Eclipse Cross', 'Express', OTHER_MODEL,
  ],
  Subaru: [
    'Impreza', 'Legacy', 'Outback', 'Forester', 'XV', 'WRX', 'BRZ', 'Levorg', OTHER_MODEL,
  ],
  Hyundai: [
    'i20', 'i30', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Kona', 'Venue', 'Palisade', 'Ioniq', OTHER_MODEL,
  ],
  Kia: [
    'Picanto', 'Rio', 'Cerato', 'Sportage', 'Sorento', 'Stonic', 'Seltos', 'Carnival', 'EV6', OTHER_MODEL,
  ],
  Ford: [
    'Fiesta', 'Focus', 'Mondeo', 'Escape', 'Everest', 'Ranger', 'Mustang', 'Territory', 'Puma', OTHER_MODEL,
  ],
  Holden: [
    'Commodore', 'Cruze', 'Astra', 'Captiva', 'Colorado', 'Trax', 'Equinox', 'Acadia', OTHER_MODEL,
  ],
  Volkswagen: [
    'Polo', 'Golf', 'Passat', 'Tiguan', 'T-Roc', 'Amarok', 'Transporter', 'Arteon', 'ID.4', OTHER_MODEL,
  ],
  BMW: [
    '1 Series', '2 Series', '3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X7', 'iX', OTHER_MODEL,
  ],
  'Mercedes-Benz': [
    'A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS', 'Sprinter', OTHER_MODEL,
  ],
  Audi: [
    'A1', 'A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7', 'Q8', 'e-tron', 'TT', OTHER_MODEL,
  ],
  Suzuki: [
    'Swift', 'Baleno', 'Vitara', 'Jimny', 'S-Cross', 'Ignis', 'Grand Vitara', OTHER_MODEL,
  ],
  Isuzu: ['D-Max', 'MU-X', OTHER_MODEL],
  Lexus: ['IS', 'ES', 'NX', 'RX', 'UX', 'LX', 'LC', OTHER_MODEL],
  Volvo: ['XC40', 'XC60', 'XC90', 'S60', 'V60', OTHER_MODEL],
  Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Renegade', 'Gladiator', OTHER_MODEL],
  'Land Rover': ['Defender', 'Discovery', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', OTHER_MODEL],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', OTHER_MODEL],
  Peugeot: ['208', '308', '3008', '5008', 'Partner', OTHER_MODEL],
  Skoda: ['Fabia', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', OTHER_MODEL],
  [OTHER_MAKE]: [OTHER_MODEL],
};

export const MAKE_OPTIONS = Object.keys(VEHICLE_MAKES).sort((a, b) => {
  if (a === OTHER_MAKE) return 1;
  if (b === OTHER_MAKE) return -1;
  return a.localeCompare(b);
});

export function getModelsForMake(make: string): string[] {
  return VEHICLE_MAKES[make] || [OTHER_MODEL];
}
