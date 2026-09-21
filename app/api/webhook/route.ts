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

    // 1. Phản hồi nhanh mã 200 cho payOS ngay lập tức (Rất quan trọng để qua bước test URL của payOS)
    // payOS chuẩn cấu trúc trả về thường có object 'data' chứa thông tin giao dịch hoặc dùng cho test ping
    if (body.success === false || !body.data) {
      console.log("⚠️ Webhook test hoặc dữ liệu không hợp lệ từ payOS, trả về 200 OK để xác nhận URL hoạt động.");
      return NextResponse.json({ success: true, message: 'Webhook received' }, { status: 200 });
    }

    const txData = body.data;
    const rawContent = txData.description || '';
    const transferAmount = txData.amount || 0;

    if (!rawContent) {
      return NextResponse.json({ success: true, message: 'Không tìm thấy nội dung giao dịch' }, { status: 200 });
    }

    // Tự động tìm đoạn mã dạng DH_xxxx nằm trong nội dung chuyển khoản
    const match = rawContent.match(/DH_\d+/i);
    const orderCode = match ? match[0] : rawContent.trim();

    console.log("🔍 Mã đơn hàng trích xuất được từ nội dung:", orderCode);

    // Tìm đơn hàng trong Supabase theo mã trích xuất
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .ilike('content', `%${orderCode}%`);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng khớp với mã:", orderCode);
      // Vẫn trả về 200 để payOS không gọi lại liên tục (retry)
      return NextResponse.json({ success: true, message: 'Không tìm thấy đơn hàng phù hợp' }, { status: 200 });
    }

    const targetOrder = orders[0];

    // Kiểm tra số tiền
    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển (${transferAmount}) nhỏ hơn tổng đơn (${targetOrder.total_amount})`);
      return NextResponse.json({ success: true, message: 'Số tiền thanh toán không đủ' }, { status: 200 });
    }

    // Update trạng thái thành 'paid'
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'paid', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', targetOrder.id);

    if (updateError) {
      console.error('❌ Lỗi update database:', updateError);
      return NextResponse.json({ success: false, message: 'Lỗi cập nhật database' }, { status: 500 });
    }

    console.log(`✅ Đơn hàng ${targetOrder.content} đã được xác nhận thanh toán thành công!`);

    return NextResponse.json({ 
      success: true, 
      message: 'Xác nhận thanh toán thành công',
      orderId: targetOrder.id 
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Lỗi xử lý Webhook:', error.message);
    // Luôn trả về 200 hoặc cấu trúc an toàn để tránh payOS bị lỗi 500/400 liên tục nếu request rác
    return NextResponse.json({ success: true, message: error.message }, { status: 200 });
  }
}
