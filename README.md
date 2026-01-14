# Unisch - PTIT Schedule Exporter

Công cụ xuất lịch học từ hệ thống QLDT sang file ICS để import vào Google Calendar.

## Chức năng

-   Tự động lấy thời khóa biểu từ API của QLDT
-   Chuyển đổi sang định dạng ICS chuẩn
-   Hỗ trợ cả script chạy trực tiếp và extension

## Cài đặt Extension

1. Mở trình duyệt Chrome/Edge
2. Vào trang quản lý extension:
    - Chrome: `chrome://extensions`
    - Edge: `edge://extensions`
3. Bật **Developer mode** (góc trên bên phải)
4. Nhấn **Load unpacked**
5. Chọn thư mục `extension/`

## Sử dụng

1. Đăng nhập vào [qldt.ptit.edu.vn](https://qldt.ptit.edu.vn)
2. Nhấn vào biểu tượng extension trên thanh công cụ
3. Nhấn nút **Xuất Lịch (.ics)**
4. Mở file ICS vừa tải về và import vào ứng dụng lịch

## Cấu trúc thư mục

```
Unisch/
├── extension/
│   ├── manifest.json
│   ├── content.js
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── export_schedule.js  # Script chạy trong Console
```

## Ghi chú

-   Thời gian mỗi tiết: 45 phút
-   Nghỉ giải lao giữa các tiết: 15 phút
-   Buổi sáng bắt đầu: 7h00
-   Buổi chiều bắt đầu: 13h00
