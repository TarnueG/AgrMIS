import { render, screen } from '@testing-library/react';
import {
  CartsSummaryCard,
  CustomersSummaryCard,
  PurchasesSummaryCard,
  SegmentDonutCard,
  TopCustomersCard,
  TopProductsCard,
} from '@/components/crm-analytics/CrmAnalyticsCards';

describe('CRM analytics cards', () => {
  it('renders the total customers card', () => {
    render(<CustomersSummaryCard data={{ total: 42, deltaPct: 8.1, period: 'last month' }} onClick={() => {}} />);
    expect(screen.getByText('Total Customers')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the total purchases card', () => {
    render(<PurchasesSummaryCard data={{ totalValue: 12400, ordersSettled: 13, deltaPct: 4.6, period: 'last period' }} onClick={() => {}} />);
    expect(screen.getByText('Total Purchases')).toBeInTheDocument();
    expect(screen.getByText('$12,400')).toBeInTheDocument();
  });

  it('renders the cart summary card', () => {
    render(<CartsSummaryCard data={{ itemCount: 9, potentialValue: 4200, openCarts: 3, deltaPct: 2.1 }} onClick={() => {}} />);
    expect(screen.getByText('Cart Items')).toBeInTheDocument();
    expect(screen.getByText('Across 3 open carts')).toBeInTheDocument();
  });

  it('renders the segment donut card', () => {
    render(<SegmentDonutCard data={{ total: 20, segments: [{ type: 'Business', count: 12, pct: 60 }, { type: 'Individual', count: 8, pct: 40 }] }} onClick={() => {}} />);
    expect(screen.getByText('Customer Segments')).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
  });

  it('renders the top customers card', () => {
    render(<TopCustomersCard data={[{ id: '1', name: 'North Grain', emailMasked: 'n****@farm.com', totalPurchase: 9200, trend: [1, 2, 3] }]} onClick={() => {}} onRowClick={() => {}} />);
    expect(screen.getByText('Top 10 Customers')).toBeInTheDocument();
    expect(screen.getByText('North Grain')).toBeInTheDocument();
  });

  it('renders the top products card', () => {
    render(<TopProductsCard data={[{ id: 'corn', name: 'Corn', color: '#6E74E0', totalVolume: 100, series: [10, 12, 9, 11, 13, 12, 14, 16, 18, 17, 19, 20], months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }]} onClick={() => {}} />);
    expect(screen.getByText('Top 5 Products')).toBeInTheDocument();
    expect(screen.getByText('Corn')).toBeInTheDocument();
  });
});
