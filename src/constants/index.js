export const USER_ROLES = ['SUPER ADMIN', 'ADMIN', 'USER'];

export const GENDERS = ['Male', 'Female', 'Other'];

export const PAGES = [
    {
        category: 'Core',
        items: [
            { id: 'my-profile', label: 'My Profile' },
            { id: 'settings', label: 'Settings' },
            { id: 'whatsapp-history', label: 'WhatsApp Logs' },
        ]
    },
    {
        category: 'Inventory',
        items: [
            { id: 'live-stock-dashboard', label: 'Live Stock Dashboard' },
            { id: 'live-stock', label: 'Live Stock Ledger' },
            { id: 'stock-management', label: 'Stocks' },
            { id: 'products', label: 'Products' },
            { id: 'product-type', label: 'Master Product' },
            { id: 'godowns', label: 'Godowns' },
            { id: 'transporters', label: 'Transporters' },
            { id: 'customers', label: 'Customers' },
            { id: 'vendors', label: 'Vendors' },
            { id: 'stock-notifications', label: 'Notifications' },
        ]
    },
    {
        category: 'Sales',
        items: [
            { id: 'Dashboard', label: 'Sales Dashboard' },
            { id: 'Order', label: 'Sales Orders' },
            { id: 'Dispatch Planning', label: 'Dispatch Planning' },
            { id: 'Inform to Party Before Dispatch', label: 'Inform Before Dispatch' },
            { id: 'Dispatch Completed', label: 'Dispatch Completed' },
            { id: 'Inform to Party After Dispatch', label: 'Inform After Dispatch' },
            { id: 'Skip Delivered', label: 'Skip Delivered' },
            { id: 'Godown', label: 'Godown' },
            { id: 'PC Report', label: 'PC Report' },
            { id: 'sell', label: 'Main Sales Module' },
        ]
    },
    {
        category: 'Purchase',
        items: [
            { id: 'purchase-dashboard', label: 'Purchase Dashboard' },
            { id: 'purchase-indent', label: 'Purchase Indent' },
            { id: 'purchase-vendor-selection', label: 'Vendor Selection' },
            { id: 'purchase-vendor-approve', label: 'Vendor Approval' },
            { id: 'purchase-delivery', label: 'Purchase Delivery' },
            { id: 'purchase-arrival', label: 'Aawak / Arrival' },
            { id: 'purchase-cancelled', label: 'Cancelled Orders' },
            { id: 'purchase-pc-report', label: 'PC Report' },
        ]
    }
];

export const DEFAULT_USER_PAGES = ['my-profile'];
