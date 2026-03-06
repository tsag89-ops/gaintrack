export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  calories: number;   // per 100g
  protein: number;    // per 100g
  carbs: number;      // per 100g
  fat: number;        // per 100g
  imageUrl?: string;
  barcode?: string;
}

export async function searchFood(query: string): Promise<FoodItem[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=20&fields=id,product_name,brands,nutriments,image_small_url,code`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.products as any[])
    .filter((p) => p.product_name && p.nutriments?.['energy-kcal_100g'])
    .map((p) => ({
      id: p.code,
      name: p.product_name,
      brand: p.brands,
      calories: p.nutriments['energy-kcal_100g'] ?? 0,
      protein: p.nutriments['proteins_100g'] ?? 0,
      carbs: p.nutriments['carbohydrates_100g'] ?? 0,
      fat: p.nutriments['fat_100g'] ?? 0,
      imageUrl: p.image_small_url,
      barcode: p.code,
    }));
}

export async function getFoodByBarcode(barcode: string): Promise<FoodItem | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
  const data = await res.json();
  if (data.status !== 1) return null;
  const p = data.product;
  return {
    id: p.code,
    name: p.product_name || 'Unknown',
    brand: p.brands,
    calories: p.nutriments['energy-kcal_100g'] ?? 0,
    protein: p.nutriments['proteins_100g'] ?? 0,
    carbs: p.nutriments['carbohydrates_100g'] ?? 0,
    fat: p.nutriments['fat_100g'] ?? 0,
    imageUrl: p.image_small_url,
    barcode: p.code,
  };
}
