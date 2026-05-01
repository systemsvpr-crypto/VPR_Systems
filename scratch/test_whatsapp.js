
import { whatsappService } from '../src/services/whatsappService.js';
import dotenv from 'dotenv';
dotenv.config();

// Mock dependencies if needed, or just run in a way that respects the environment
// Since it's a test script, we can call the service directly if we handle the imports

async function testSend() {
    console.log('Sending Test WhatsApp Notification...');
    try {
        const response = await whatsappService.sendDispatchNotification('9691207533', {
            customerName: 'Test Customer',
            orderNumber: 'VPR/TEST-001',
            productName: 'Test Product (50 KG)',
            dispatchDate: new Date().toISOString().split('T')[0]
        }, { stage: 'After Dispatch' });
        
        console.log('Success:', response);
    } catch (error) {
        console.error('Failed:', error.message);
    }
}

testSend();
