document.getElementById("exportBtn").addEventListener("click", async () => {
    const statusDiv = document.getElementById("status");
    const btn = document.getElementById("exportBtn");
    const shouldMerge = document.getElementById("mergeCheckbox").checked;

    statusDiv.textContent = "Đang xử lý...";
    statusDiv.className = "";
    btn.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab.url.includes("qldt.ptit.edu.vn")) {
            throw new Error("Vui lòng mở trang qldt.ptit.edu.vn!");
        }

        // Gửi message xuống content script với option merge
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "START_EXPORT",
            merge: shouldMerge,
        });

        if (response && response.success) {
            statusDiv.textContent = response.message;
            statusDiv.className = "success";
        } else {
            throw new Error(response ? response.message : "Lỗi không xác định");
        }
    } catch (err) {
        console.error(err);
        statusDiv.textContent = err.message || "Có lỗi xảy ra";
        statusDiv.className = "error";
    } finally {
        btn.disabled = false;
    }
});
