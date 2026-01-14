// Content script lắng nghe message từ popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_SEMESTERS") {
        fetchSemesters()
            .then((data) => {
                sendResponse({ success: true, data: data });
            })
            .catch((err) => {
                sendResponse({ success: false, message: err.message });
            });
        return true; // Giữ kênh mở cho phản hồi bất đồng bộ
    }

    if (request.action === "START_EXPORT") {
        const shouldMerge = request.merge !== undefined ? request.merge : true;
        const selectedSemester = request.hoc_ky || 20252;
        exportSchedule(shouldMerge, selectedSemester)
            .then((msg) => {
                sendResponse({ success: true, message: msg });
            })
            .catch((err) => {
                sendResponse({ success: false, message: err.message });
            });
        return true; // Giữ kênh mở cho phản hồi bất đồng bộ
    }
});

// Lấy danh sách học kỳ
async function fetchSemesters() {
    const token = getToken();
    const response = await fetch("https://qldt.ptit.edu.vn/dkmh/api/sch/w-locdshockytkbuser", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            filter: { is_tieng_anh: null },
            additional: {
                paging: { limit: 100, page: 1 },
                ordering: [{ name: "hoc_ky", order_type: 1 }],
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Lỗi API: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (!json.data || !json.data.ds_hoc_ky) {
        throw new Error("Không thể lấy danh sách học kỳ");
    }

    return json.data;
}

// Lấy token từ sessionStorage
function getToken() {
    const userStr = sessionStorage.getItem("CURRENT_USER");
    if (!userStr) {
        throw new Error("Không tìm thấy thông tin đăng nhập! Vui lòng đăng nhập qldt.ptit.edu.vn trước.");
    }
    try {
        const user = JSON.parse(userStr);
        return user.access_token || user;
    } catch (e) {
        console.warn("Không parse được JSON user, thử dùng trực tiếp chuỗi...");
        return userStr;
    }
}

async function exportSchedule(shouldMerge = true, selectedSemester = 20252) {
    // --- CẤU HÌNH ---
    const CONFIG = {
        API_URL: "https://qldt.ptit.edu.vn/dkmh/api/sch/w-locdstkbtuanusertheohocky",
        PERIOD_DURATION: 45, // Phút
        START_TIMES: {
            // Sáng: Bắt đầu 7h, mỗi tiết cách nhau 1 tiếng
            1: { h: 7, m: 0 },
            2: { h: 8, m: 0 },
            3: { h: 9, m: 0 },
            4: { h: 10, m: 0 },
            5: { h: 11, m: 0 },
            6: { h: 12, m: 0 },

            // Chiều: Bắt đầu 13h, mỗi tiết cách nhau 1 tiếng
            7: { h: 13, m: 0 },
            8: { h: 14, m: 0 },
            9: { h: 15, m: 0 },
            10: { h: 16, m: 0 },
            11: { h: 17, m: 0 },
            12: { h: 18, m: 0 },
        },
    };

    // --- HÀM TIỆN ÍCH ---

    function formatICSDate(dateStr, timeObj = { h: 0, m: 0 }) {
        // dateStr: "2026-01-12T00:00:00" -> Đối tượng Date
        const d = new Date(dateStr);
        d.setHours(timeObj.h);
        d.setMinutes(timeObj.m);

        // Định dạng: YYYYMMDDTHHmmSS
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hour = String(d.getHours()).padStart(2, "0");
        const minute = String(d.getMinutes()).padStart(2, "0");
        const second = String(d.getSeconds()).padStart(2, "0");

        return `${year}${month}${day}T${hour}${minute}${second}`;
    }

    function getEndTime(startTimeObj, periods) {
        const startTotalMinutes = startTimeObj.h * 60 + startTimeObj.m;
        // Mỗi tiết 45p, nghỉ giữa các tiết 15p (vì mỗi tiết cách nhau 1 tiếng)
        // Tổng thời gian = (Số tiết * 45) + ((Số tiết - 1) * 15)
        const durationMinutes = periods * 45 + (periods - 1) * 15;
        const endTotalMinutes = startTotalMinutes + durationMinutes;

        const endH = Math.floor(endTotalMinutes / 60);
        const endM = endTotalMinutes % 60;

        return { h: endH, m: endM };
    }

    /**
     * Gộp các buổi học liên tiếp có cùng môn trong cùng ngày.
     * Ví dụ: "Môn A (Tiết 7-8)" + "Môn A (Tiết 9-9)" -> "Môn A (Tiết 7-9)"
     */
    function mergeConsecutiveClasses(classes) {
        if (classes.length === 0) return [];

        // Sắp xếp theo: ngày học -> tên môn -> tiết bắt đầu
        classes.sort((a, b) => {
            if (a.ngay_hoc !== b.ngay_hoc) return a.ngay_hoc.localeCompare(b.ngay_hoc);
            if (a.ten_mon !== b.ten_mon) return a.ten_mon.localeCompare(b.ten_mon);
            return a.tiet_bat_dau - b.tiet_bat_dau;
        });

        const merged = [];
        let current = { ...classes[0] };

        for (let i = 1; i < classes.length; i++) {
            const next = classes[i];
            const currentEnd = current.tiet_bat_dau + current.so_tiet;

            // Kiểm tra cùng ngày, cùng môn, cùng phòng, và tiết liên tiếp
            const isSameDay = current.ngay_hoc === next.ngay_hoc;
            const isSameSubject = current.ten_mon === next.ten_mon;
            const isSameRoom = current.ma_phong === next.ma_phong;
            const isConsecutive = next.tiet_bat_dau === currentEnd;

            if (isSameDay && isSameSubject && isSameRoom && isConsecutive) {
                // Gộp: mở rộng số tiết
                current.so_tiet += next.so_tiet;
                console.log(`[MERGE] ${current.ten_mon}: Tiết ${current.tiet_bat_dau}-${current.tiet_bat_dau + current.so_tiet - 1}`);
            } else {
                merged.push(current);
                current = { ...next };
            }
        }
        merged.push(current);

        return merged;
    }

    // --- LOGIC CHÍNH ---

    console.log(`Đang khởi động quy trình xuất lịch (Học kỳ: ${selectedSemester})...`);

    console.log("Đang tải dữ liệu lịch học...");
    const token = getToken();
    const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            filter: {
                hoc_ky: selectedSemester,
                ten_hoc_ky: "",
            },
            additional: {
                paging: {
                    limit: 100,
                    page: 1,
                },
                ordering: [
                    {
                        name: null,
                        order_type: null,
                    },
                ],
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Lỗi API: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (!json.data || !json.data.ds_tuan_tkb) {
        console.error("Cấu trúc JSON nhận được không đúng:", json);
        let msg = "Dữ liệu trả về không đúng cấu trúc mong đợi.";
        if (json.meta && json.meta.message) {
            msg += ` Server nhắn: ${json.meta.message}`;
        }
        throw new Error(msg);
    }

    console.log(`Tìm thấy ${json.data.ds_tuan_tkb.length} tuần học.`);

    // Thu thập tất cả các buổi học
    let allClasses = [];
    json.data.ds_tuan_tkb.forEach((tuan) => {
        tuan.ds_thoi_khoa_bieu.forEach((buoi) => {
            if (!buoi.is_nghi_day) {
                allClasses.push({ ...buoi });
            }
        });
    });

    console.log(`Tổng số buổi học trước khi xử lý: ${allClasses.length}`);

    // Gộp các buổi học liên tiếp nếu được yêu cầu
    let processedClasses = shouldMerge ? mergeConsecutiveClasses(allClasses) : allClasses;

    if (shouldMerge) {
        console.log(`Tổng số event sau khi merge: ${processedClasses.length}`);
    }

    let icsContent = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PTIT Schedule Exporter//Unisch//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

    let eventCount = 0;

    processedClasses.forEach((buoi) => {
        const monHoc = buoi.ten_mon;
        const giangVien = buoi.ten_giang_vien;
        const phong = buoi.ma_phong;
        const lop = buoi.ma_lop;
        const ngayHocStr = buoi.ngay_hoc;
        const tietBatDau = buoi.tiet_bat_dau;
        const soTiet = buoi.so_tiet;

        const timeStart = CONFIG.START_TIMES[tietBatDau];
        if (!timeStart) {
            console.warn(`Không rõ giờ bắt đầu cho tiết ${tietBatDau} của môn ${monHoc}. Bỏ qua.`);
            return;
        }

        const timeEnd = getEndTime(timeStart, soTiet);

        const dtStart = formatICSDate(ngayHocStr, timeStart);
        const dtEnd = formatICSDate(ngayHocStr, timeEnd);

        const summary = `${monHoc} - ${buoi.ma_nhom || ""}`;
        const description = `Giảng viên: ${giangVien}\\nLớp: ${lop}\\nTiết: ${tietBatDau} - ${tietBatDau + soTiet - 1}`;
        const location = phong;

        icsContent.push("BEGIN:VEVENT");
        icsContent.push(`UID:${buoi.id_tkb}-${buoi.ngay_hoc}@ptit.edu.vn`);
        icsContent.push(`DTSTAMP:${formatICSDate(new Date().toISOString())}`);
        icsContent.push(`DTSTART:${dtStart}`);
        icsContent.push(`DTEND:${dtEnd}`);
        icsContent.push(`SUMMARY:${summary}`);
        icsContent.push(`DESCRIPTION:${description}`);
        icsContent.push(`LOCATION:${location}`);
        icsContent.push("END:VEVENT");

        eventCount++;
    });

    icsContent.push("END:VCALENDAR");

    if (eventCount === 0) {
        throw new Error("Không tìm thấy lịch học nào để xuất!");
    }

    // Tải file
    const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `TKB_PTIT_${selectedSemester}_${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Đã xuất thành công ${eventCount} sự kiện lịch!`);
    return `Đã xuất ${eventCount} buổi học thành công!`;
}
