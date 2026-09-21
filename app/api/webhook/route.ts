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

    // Lấy chuỗi mô tả giao dịch từ Sepay
    const rawContent = body.content || body.description || '';
    const transferAmount = body.transferAmount || body.amountIn || 0;

    if (!rawContent) {
      return NextResponse.json({ success: true, message: 'No content found' }, { status: 200 });
    }

    // Dùng Regex linh hoạt để bắt cả "DH2532" lẫn "DH_2532"
    const match = rawContent.match(/DH[_]?\d+/i);
    if (!match) {
      console.log("⚠️ Không tìm thấy định dạng mã đơn hàng trong nội dung:", rawContent);
      return NextResponse.json({ success: true, message: 'Invalid order format' }, { status: 200 });
    }

    // Chuẩn hóa về dạng khớp với database (vd: bỏ dấu gạch dưới nếu có, hoặc giữ nguyên tùy cấu trúc bảng)
    const orderCode = match[0]; // Giữ nguyên khớp với cột content (DH2532)

    console.log("🔍 Mã đơn trích xuất thành công:", orderCode, "Số tiền:", transferAmount);

    // Tìm đơn hàng đang chờ thanh toán trong Supabase (so khớp cả cột id hoặc content)
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .or(`content.ilike.%${orderCode}%,id.eq.${orderCode}`);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng khớp trong DB với mã:", orderCode);
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
      return NextResponse.json({ success: true, message: 'Database error' }, { status: 200 });
    }

    console.log(`✅ Đơn hàng ${targetOrder.id} đã thanh toán thành công qua Sepay!`);

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
