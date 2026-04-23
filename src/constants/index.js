export const USER_ROLES = ['SUPER ADMIN', 'ADMIN', 'USER'];

export const GENDERS = ['Male', 'Female', 'Other'];

export const PAGES = [
    {
        category: 'Core',
        items: [
            { id: 'my-profile', label: 'My Profile' },
            { id: 'settings', label: 'Settings' },
        ]
    },
    {
        category: 'Inventory',
        items: [
            { id: 'live-stock-dashboard', label: 'Live Stock Dashboard' },
            { id: 'stock-management', label: 'Stocks' },
            { id: 'products', label: 'Products' },
            { id: 'godowns', label: 'Godowns' },
            { id: 'transporters', label: 'Transporters' },
            { id: 'stock-notifications', label: 'Notifications' },
        ]
    },
    {
        category: 'Sell / Dispatch',
        items: [
            { id: 'Dashboard', label: 'Sell Dashboard' },
            { id: 'Order', label: 'Orders' },
            { id: 'Dispatch Planning', label: 'Dispatch Planning' },
            { id: 'Inform to Party Before Dispatch', label: 'Inform Before Dispatch' },
            { id: 'Dispatch Completed', label: 'Dispatch Completed' },
            { id: 'Inform to Party After Dispatch', label: 'Inform After Dispatch' },
            { id: 'Skip Delivered', label: 'Skip Delivered' },
            { id: 'Godown', label: 'Godown' },
            { id: 'PC Report', label: 'PC Report' },
            { id: 'sell', label: 'Main Sell Page' },
        ]
    },
    {
        category: 'Purchase',
        items: [
            { id: 'purchase-dashboard', label: 'Purchase Dashboard' },
            { id: 'purchase-orders', label: 'Purchase Orders' },
        ]
    }
];

export const DEFAULT_USER_PAGES = ['my-profile'];
