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

    // Dùng Regex linh hoạt để bắt cả "DH5898" lẫn "DH_5898"
    const match = rawContent.match(/DH[_]?\d+/i);
    if (!match) {
      console.log("⚠️ Không tìm thấy định dạng mã đơn hàng trong nội dung:", rawContent);
      return NextResponse.json({ success: true, message: 'Invalid order format' }, { status: 200 });
    }

    const cleanCode = match[0].replace('_', ''); // Ví dụ: DH5898
    const withUnderscore = cleanCode.replace('DH', 'DH_'); // Ví dụ: DH_5898

    console.log("🔍 Mã đơn tìm kiếm trong DB:", cleanCode, "hoặc", withUnderscore, "Số tiền:", transferAmount);

    // Tìm kiếm linh hoạt cả hai dạng trong Supabase (cả cột id và cột content)
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .or(`content.ilike.%${cleanCode}%,content.ilike.%${withUnderscore}%,id.eq.${cleanCode},id.eq.${withUnderscore}`);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng khớp trong DB với các mã trên!");
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
