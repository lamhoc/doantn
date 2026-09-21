import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("🔥 ĐÃ NHẬN WEBHOOK TỪ SEPAY:", JSON.stringify(body));

    // Lấy mã từ trường code hoặc trích xuất từ content
    let orderCode = body.code || '';
    const rawContent = body.content || body.description || '';
    const transferAmount = body.transferAmount || body.amountIn || 0;

    if (!orderCode && rawContent) {
      const match = rawContent.match(/DH[_]?\d+/i);
      if (match) {
        orderCode = match[0];
      }
    }

    if (!orderCode) {
      console.log("⚠️ Không tìm thấy mã đơn hàng trong payload!");
      return NextResponse.json({ success: true, message: 'Invalid order format' }, { status: 200 });
    }

    const cleanCode = orderCode.replace('_', ''); // Ví dụ: DH4506

    console.log("🔍 Đang tìm đơn hàng trong DB với mã tại cột content:", cleanCode, "Số tiền:", transferAmount);

    // Truy vấn tìm đơn hàng có chứa mã trong cột content
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .ilike('content', `%${cleanCode}%`)
      .limit(1);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng nào có content chứa mã:", cleanCode);
      return NextResponse.json({ success: true, message: 'Order not found' }, { status: 200 });
    }

    const targetOrder = orders[0];
    console.log("✅ Đã tìm thấy đơn hàng:", targetOrder);

    // Kiểm tra số tiền thanh toán
    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển (${transferAmount}) nhỏ hơn tổng đơn (${targetOrder.total_amount})`);
      return NextResponse.json({ success: true, message: 'Insufficient amount' }, { status: 200 });
    }

    // Cập nhật trạng thái đơn hàng thành 'paid'
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'paid', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', targetOrder.id); // Dùng khóa chính id của dòng tìm được để update

    if (updateError) {
      console.error('❌ Lỗi update database:', updateError);
      return NextResponse.json({ success: true, message: 'Database error' }, { status: 200 });
    }

    console.log(`🎉 HOÀN TẤT! Đơn hàng ${targetOrder.id} đã được cập nhật thành công qua cột content!`);

    return NextResponse.json({ 
      success: true, 
      message: 'Success',
      orderId: targetOrder.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Lỗi xử lý Webhook Sepay:', error.message);
    return NextResponse.json({ success: true, message: error.message }, { status: 200 });
  }
}
