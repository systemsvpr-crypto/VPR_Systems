import React from 'react';
import { ShoppingCart, ClipboardList, FileText, Settings as SettingsIcon } from 'lucide-react';

const Purchase = () => {
    return (
        <div className="flex flex-col min-h-screen bg-[#F5F5F5] p-6">
            <div className="bg-white border-b border-gray-100 px-4 sm:px-6 pt-5 pb-4 shadow-sm rounded-lg mb-6">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Module</p>
                    <h1 className="text-xl font-extrabold tracking-tight leading-none mt-0.5">
                        <span className="text-orange-600">Purchase</span>
                        <span className="text-gray-400 mx-1.5">/</span>
                        <span className="text-gray-700">Procurement</span>
                    </h1>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Placeholders for purchase modules */}
                <PurchaseCard 
                    title="Purchase Dashboard" 
                    description="View overview of procurement activities"
                    icon={ShoppingCart}
                    color="text-orange-600"
                    bgColor="bg-orange-50"
                />
                <PurchaseCard 
                    title="Purchase Orders" 
                    description="Manage and track purchase orders"
                    icon={ClipboardList}
                    color="text-blue-600"
                    bgColor="bg-blue-50"
                />
                <PurchaseCard 
                    title="Vendor Management" 
                    description="Manage supplier relationships and data"
                    icon={FileText}
                    color="text-green-600"
                    bgColor="bg-green-50"
                />
            </div>
        </div>
    );
};

const PurchaseCard = ({ title, description, icon: Icon, color, bgColor }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
        <div className={`w-12 h-12 ${bgColor} ${color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
            <Icon size={24} />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
);

export default Purchase;
