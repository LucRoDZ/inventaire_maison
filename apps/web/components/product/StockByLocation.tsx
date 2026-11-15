import type { ProductStockByLocationDto } from '@inventaire/shared';
import { Card } from '../ui/Card';

const formatDate = (iso: string) => iso.split('-').reverse().join('/');
const units = (n: number) => `${n} ${n > 1 ? 'unités' : 'unité'}`;

/** Where the product is: by furniture, then by shelf and expiry date. */
export function StockByLocation({ stock }: { stock: ProductStockByLocationDto[] }) {
  if (stock.length === 0) {
    return <p className="text-body">Ce produit n’est pas en stock.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {stock.map((location) => (
        <li key={location.locationId}>
          <Card>
            <h3 className="text-card-title">
              {location.locationName} : {units(location.quantity)}
            </h3>
            <ul className="mt-2 flex flex-col gap-1">
              {location.lines.map((line) => (
                <li key={line.id} className="text-body">
                  {line.shelfName ?? 'Non rangé'} · {units(line.quantity)}
                  {line.expiryDate ? ` · limite le ${formatDate(line.expiryDate)}` : ''}
                </li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ul>
  );
}
