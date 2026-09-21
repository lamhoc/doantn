import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("🔥 ĐÃ NHẬN WEBHOOK TỪ PAYOS:", JSON.stringify(body));

    const txData = body.data;
    if (!txData) {
      return NextResponse.json({ success: true, message: 'Invalid payload' }, { status: 200 });
    }

    // Lấy nội dung mô tả hoặc mã đơn hàng từ payOS trả về
    const rawContent = txData.description || String(txData.orderCode || '');
    const transferAmount = txData.amount || 0;

    console.log("🔍 Nội dung/Mã đơn trích xuất:", rawContent, "Số tiền:", transferAmount);

    // Tìm đơn hàng trong Supabase theo orderCode hoặc chứa mã DH_
    const match = rawContent.match(/DH_\d+/i);
    const orderCode = match ? match[0] : rawContent.trim();

    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .or(`id.eq.${orderCode},content.ilike.%${orderCode}%`);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng khớp với:", orderCode);
      return NextResponse.json({ success: true, message: 'Order not found' }, { status: 200 });
    }

    const targetOrder = orders[0];

    // Kiểm tra số tiền thanh toán
    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển (${transferAmount}) nhỏ hơn tổng đơn (${targetOrder.total_amount})`);
      return NextResponse.json({ success: true, message: 'Insufficient amount' }, { status: 200 });
    }

    // Cập nhật trạng thái đơn hàng thành 'paid' trong Supabase
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'paid', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', targetOrder.id);

    if (updateError) {
      console.error('❌ Lỗi update database:', updateError);
      return NextResponse.json({ success: false, message: 'Database error' }, { status: 500 });
    }

    console.log(`✅ Đơn hàng ${targetOrder.id} đã thanh toán thành công!`);

    return NextResponse.json({ 
      success: true, 
      message: 'Success',
      orderId: targetOrder.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Lỗi xử lý Webhook:', error.message);
    return NextResponse.json({ success: true, message: error.message }, { status: 200 });
  }
}
