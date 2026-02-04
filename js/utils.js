// utils.js - 유틸리티 함수
        function findLocationByCoords(lng, lat) {
            const coords = [lng, lat];
            let district = null;
            let dong = null;

            // 먼저 구 찾기
            if (geoData && geoData.features) {
                for (const feature of geoData.features) {
                    if (d3.geoContains(feature, coords)) {
                        district = feature.properties.name;
                        break;
                    }
                }
            }

            // 구를 찾았으면 해당 구의 동 찾기
            if (district && dongGeoData && dongGeoData.features) {
                // 해당 구의 코드로 동들 필터링 (addDongOverlay와 동일한 방식)
                const code = districtCodes[district];
                const dongFeatures = code ? dongGeoData.features.filter(f =>
                    f.properties.code && f.properties.code.startsWith(code)
                ) : [];

                for (const feature of dongFeatures) {
                    if (d3.geoContains(feature, coords)) {
                        dong = feature.properties.name || feature.properties.EMD_KOR_NM;
                        break;
                    }
                }
            }

            return { district, dong };
        }

        // 센서 상태에 따른 CSS 클래스
        function getSensorStatusClass(sensorId) {
            const status = getSensorStatus(sensorId);
            return `status-${status}`;
        }

        // 센서 모델 타입 반환 (V02Q → 'v', OC3 → 'o')
        function getSensorModelType(sensorId) {
            if (!sensorId) return 'v';
            const firstChar = sensorId.charAt(0).toUpperCase();
            return firstChar === 'O' ? 'o' : 'v';
        }

        function getTempLevel(temp) {
            if (temp === null || temp === undefined || isNaN(temp)) return 'level-unknown';
            if (temp < 0) return 'level-cold';
            if (temp < 10) return 'level-cool';
            if (temp < 25) return 'level-good';
            if (temp < 35) return 'level-bad';
            return 'level-danger';
        }

        // 지역 크기에 맞는 폰트 크기 계산
        function calculateFontSize(feature, path, text, minSize = 6, maxSize = 14) {
            const bounds = path.bounds(feature);
            const width = bounds[1][0] - bounds[0][0];
            const height = bounds[1][1] - bounds[0][1];

            // 텍스트 길이에 따른 폰트 크기 계산 (가로 기준)
            const charWidth = 0.6; // 대략적인 문자 폭 비율
            const textLength = text.length;
            const maxFontByWidth = (width * 0.8) / (textLength * charWidth);

            // 세로 기준 폰트 크기
            const maxFontByHeight = height * 0.25;

            // 둘 중 작은 값 선택, min/max 범위 내로 제한
            const fontSize = Math.min(maxFontByWidth, maxFontByHeight);
            return Math.max(minSize, Math.min(maxSize, fontSize));
        }

