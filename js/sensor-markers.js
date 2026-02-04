// sensor-markers.js - 센서 마커 관리

// 센서 상태 시각적 업데이트
function updateSensorMarkers() {
    d3.selectAll('.sensor-marker').each(function() {
        const marker = d3.select(this);
        const sensorId = marker.attr('data-sensor-id');
        const statusClass = getSensorStatusClass(sensorId);

        // 기존 상태 클래스 제거 후 새 클래스 적용
        marker.attr('class', `sensor-marker ${statusClass}`);

        // 이상 센서는 클릭 가능 커서로
        marker.style('cursor', getSensorStatus(sensorId) !== 'normal' ? 'pointer' : 'default');
    });

    // 역추적선 선택 해제 (센서 상태가 바뀌면)
    selectedSensorForTraceback = null;
    d3.selectAll('.traceback-group *').remove();
}
