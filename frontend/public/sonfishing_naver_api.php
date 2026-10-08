<?php
/**
 * 네이버 스마트스토어 릴레이 API (PHP 7)
 * naver_relay_server.py 를 PHP 로 포팅 + 신규상품 동기화(sync) 네이티브 구현
 *
 * 엔드포인트:
 *   GET  ?action=health
 *   GET  ?action=test-naver
 *   GET  ?action=my-ip               (서버 아웃바운드 IP 확인 - 네이버 IP 등록용)
 *   POST ?action=update-stock          body: {"product": {...}, "newStockQuantity": 10}
 *   POST ?action=sync-new-products     (python 불필요 - PHP가 네이버API+Supabase 직접 호출)
 *
 * 필요 확장: curl (표준), bcrypt 서명은 crypt() 내장 함수 사용
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('CLIENT_ID', '6qGLtWWL2ryrsoLgpvWdDd');
define('CLIENT_SECRET', '$2a$04$ONp/Q938mpD/LfX/Bzhl4O');

define('SUPABASE_URL', 'https://ubwccmgpoghfecmgiici.supabase.co');
define('SUPABASE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVid2NjbWdwb2doZmVjbWdpaWNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjIwMDU1NSwiZXhwIjoyMDkxNzc2NTU1fQ.M49FLuvgGGe2M5oRt6MavxUH_Ju5r6Mr95PW6ujWq5g');
define('SUPABASE_TABLE', 'smartstore_products');

define('SYNC_LOCK_SECONDS', 600);

// 전체 갱신 시 상세 정보 병렬 조회 개수
define('DETAIL_CONCURRENCY', 10);

function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function get_outbound_ip() {
    $services = array(
        'https://api.ipify.org',
        'http://ifconfig.me/ip',
        'https://ipecho.net/plain',
    );
    foreach ($services as $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
        ));
        $res = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res !== false) {
            $ip = trim((string)$res);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return null;
}

function get_access_token() {
    // 32비트 PHP에서 (int) 캐스팅 시 오버플로우로 과거 시간이 되는 문제 방지
    // (float 를 정수형 문자열로 그대로 변환)
    $timestamp = sprintf('%.0f', round(microtime(true) * 1000));
    $password = CLIENT_ID . '_' . $timestamp;

    // bcrypt 해시 생성 (시크릿 자체를 bcrypt salt 로 사용)
    // CLIENT_SECRET($2a$04$...) 은 유효한 bcrypt salt 형식이므로 crypt() 에 그대로 전달
    $hashed = crypt($password, CLIENT_SECRET);
    if ($hashed === false || strlen($hashed) < 60) {
        throw new Exception('bcrypt 서명 생성 실패');
    }
    $sign = base64_encode($hashed);

    $post = http_build_query(array(
        'client_id' => CLIENT_ID,
        'timestamp' => $timestamp,
        'client_secret_sign' => $sign,
        'grant_type' => 'client_credentials',
        'type' => 'SELF',
    ));

    $ch = curl_init('https://api.commerce.naver.com/external/v1/oauth2/token');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ));
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        throw new Exception('토큰 발급 실패(curl): ' . $err);
    }
    $data = json_decode($res, true);
    if ($code !== 200 || empty($data['access_token'])) {
        throw new Exception('토큰 발급 실패: ' . $code . ' - ' . $res);
    }
    return $data['access_token'];
}

function api_request($method, $url, $token, $body = null) {
    $ch = curl_init($url);
    $headers = array(
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    );
    curl_setopt_array($ch, array(
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
    ));
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        throw new Exception('API 요청 실패(curl): ' . $err);
    }
    return array($code, json_decode($res, true), $res);
}

function update_naver_stock($token, $product, $newQty) {
    $category = isset($product['category']) ? $product['category'] : '';
    $originNo = isset($product['origin_product_no']) ? $product['origin_product_no'] : null;
    $optionId = isset($product['option_id']) ? $product['option_id'] : null;
    $basePrice = isset($product['base_price']) ? $product['base_price'] : 0;

    if ($category === '일반옵션') {
        if (!$originNo || !$optionId) {
            throw new Exception('일반옵션: origin_product_no, option_id 필요');
        }
        $url = "https://api.commerce.naver.com/external/v1/products/origin-products/{$originNo}/option-stock";
        $body = array(
            'productSalePrice' => array('salePrice' => $basePrice),
            'optionInfo' => array(
                'optionCombinations' => array(array(
                    'id' => $optionId,
                    'stockQuantity' => $newQty,
                    'usable' => true,
                )),
            ),
        );
        list($code, $data, $raw) = api_request('PUT', $url, $token, $body);
        if ($code !== 200) {
            throw new Exception("스마트스토어 재고 업데이트 실패: {$code} - {$raw}");
        }
        return $data;
    }

    if ($category === '추가옵션') {
        if (!$originNo || !$optionId) {
            throw new Exception('추가옵션: origin_product_no, option_id 필요');
        }

        $getUrl = "https://api.commerce.naver.com/external/v2/products/origin-products/{$originNo}";
        list($code, $productData, $raw) = api_request('GET', $getUrl, $token);
        if ($code !== 200) {
            throw new Exception("상품 조회 실패: {$code} - {$raw}");
        }

        $origin = isset($productData['originProduct']) ? $productData['originProduct'] : array();
        $detail = isset($origin['detailAttribute']) ? $origin['detailAttribute'] : array();
        $suppInfo = isset($detail['supplementProductInfo']) ? $detail['supplementProductInfo'] : array();
        $supps = isset($suppInfo['supplementProducts']) ? $suppInfo['supplementProducts'] : array();

        $found = false;
        foreach ($supps as $i => $sp) {
            if ((string)$sp['id'] === (string)$optionId) {
                $supps[$i]['stockQuantity'] = $newQty;
                $supps[$i]['usable'] = $newQty > 0;
                $found = true;
                break;
            }
        }
        if (!$found) {
            throw new Exception("추가옵션 ID {$optionId}를 찾을 수 없습니다");
        }

        $suppInfo['supplementProducts'] = $supps;
        $detail['supplementProductInfo'] = $suppInfo;
        $origin['detailAttribute'] = $detail;
        $putBody = array('originProduct' => $origin);

        list($code, $data, $raw) = api_request('PUT', $getUrl, $token, $putBody);
        if ($code !== 200) {
            throw new Exception("추가옵션 재고 업데이트 실패: {$code} - {$raw}");
        }
        return $data;
    }

    if ($category === '원상품') {
        if (!$originNo) {
            throw new Exception('원상품: origin_product_no 필요');
        }
        $url = "https://api.commerce.naver.com/external/v1/products/{$originNo}/stock";
        $body = array('stockQuantity' => $newQty);
        list($code, $data, $raw) = api_request('PUT', $url, $token, $body);
        if ($code !== 200) {
            throw new Exception("스마트스토어 재고 업데이트 실패: {$code} - {$raw}");
        }
        return $data;
    }

    throw new Exception('알 수 없는 category: ' . $category);
}

function fetch_product_detail($token, $originNo) {
    list($code, $data, $raw) = api_request('GET', "https://api.commerce.naver.com/external/v2/products/origin-products/{$originNo}", $token);
    if ($code === 200) {
        return $data;
    }
    // 404 시 채널 상품 시도
    list($code2, $data2, $raw2) = api_request('GET', "https://api.commerce.naver.com/external/v2/products/channel-products/{$originNo}", $token);
    if ($code2 === 200) {
        return $data2;
    }
    return null;
}

function parse_product_rows($originNo, $productData) {
    $rows = array();
    $originProd = isset($productData['originProduct']) ? $productData['originProduct'] : $productData;

    $prodName = isset($originProd['name']) ? (string)$originProd['name'] : 'N/A';
    $prodName = str_replace(array("\n", "\r", "\t"), ' ', $prodName);
    $salePrice = isset($originProd['salePrice']) ? $originProd['salePrice'] : 0;

    // 즉시할인(customerBenefit.immediateDiscountPolicy) 반영 기본가
    $basePrice = $salePrice;
    $cb = isset($originProd['customerBenefit']) ? $originProd['customerBenefit'] : array();
    $disc = (isset($cb['immediateDiscountPolicy']['discountMethod'])) ? $cb['immediateDiscountPolicy']['discountMethod'] : array();
    $val = isset($disc['value']) ? $disc['value'] : 0;
    $unit = isset($disc['unitType']) ? $disc['unitType'] : 'WON';
    if (is_numeric($val) && $val > 0) {
        if ($unit === 'PERCENT') {
            $basePrice = max((int)round($salePrice * (100 - $val) / 100), 0);
        } else {
            $basePrice = max((int)($salePrice - $val), 0);
        }
    }

    $baseStock = isset($originProd['stockQuantity']) ? $originProd['stockQuantity'] : 0;
    $sellerCode = isset($originProd['sellerManagementCode']) ? $originProd['sellerManagementCode'] : '';

    $statusMap = array('SALE'=>'판매중','OUT_OF_STOCK'=>'품절','SUSPENSION'=>'판매중지','UNAPPROVED'=>'승인대기','CLOSE'=>'전시중지');
    $rawStatus = isset($originProd['statusType']) ? $originProd['statusType'] : 'SALE';
    $baseStatus = isset($statusMap[$rawStatus]) ? $statusMap[$rawStatus] : $rawStatus;

    $displayMap = array('ON'=>'전시중','WAIT'=>'전시대기','SUSPENSION'=>'전시중지');
    $rawDisplay = isset($originProd['smartstoreChannelProduct']['channelProductDisplayStatusType']) ? $originProd['smartstoreChannelProduct']['channelProductDisplayStatusType'] : '';
    $baseDisplay = isset($displayMap[$rawDisplay]) ? $displayMap[$rawDisplay] : $rawDisplay;

    $detailAttr = isset($originProd['detailAttribute']) ? $originProd['detailAttribute'] : array();

    // 태그 추출
    $tagsStr = '';
    if (isset($detailAttr['seoInfo']['sellerTags']) && is_array($detailAttr['seoInfo']['sellerTags'])) {
        $texts = array();
        foreach ($detailAttr['seoInfo']['sellerTags'] as $t) {
            if (is_array($t) && isset($t['text']) && $t['text'] !== '') {
                $texts[] = $t['text'];
            }
        }
        $tagsStr = implode(', ', $texts);
    }

    $optionCombinations = (isset($detailAttr['optionInfo']['optionCombinations']) && is_array($detailAttr['optionInfo']['optionCombinations'])) ? $detailAttr['optionInfo']['optionCombinations'] : array();
    $suppProducts = (isset($detailAttr['supplementProductInfo']['supplementProducts']) && is_array($detailAttr['supplementProductInfo']['supplementProducts'])) ? $detailAttr['supplementProductInfo']['supplementProducts'] : array();

    // 1. 일반 옵션
    if (count($optionCombinations) > 0) {
        foreach ($optionCombinations as $item) {
            $optId = isset($item['id']) ? (string)$item['id'] : '';
            $optNames = array();
            for ($i = 1; $i <= 3; $i++) {
                if (!empty($item['optionName' . $i])) {
                    $optNames[] = $item['optionName' . $i];
                }
            }
            $optNameStr = implode(' / ', $optNames);
            $optPrice = isset($item['price']) ? $item['price'] : 0;
            $stock = isset($item['stockQuantity']) ? $item['stockQuantity'] : 0;
            $usable = !isset($item['usable']) || $item['usable'];
            if ($usable && $stock > 0) {
                $optStatus = '판매중';
            } elseif ($stock == 0) {
                $optStatus = '품절';
            } else {
                $optStatus = '사용불가';
            }
            $optCode = isset($item['sellerManagerCode']) ? $item['sellerManagerCode'] : '';

            $rows[] = array(
                $originNo, '일반옵션', $optId, $prodName, $optNameStr,
                (string)$basePrice, (string)$optPrice, (string)$stock,
                $optStatus, $optCode, $tagsStr, $usable ? 'Y' : 'N'
            );
        }
    }

    // 2. 추가 옵션
    if (count($suppProducts) > 0) {
        foreach ($suppProducts as $supp) {
            $suppId = isset($supp['id']) ? (string)$supp['id'] : '';
            $groupN = isset($supp['groupName']) ? $supp['groupName'] : '추가상품';
            $nameVal = isset($supp['name']) ? $supp['name'] : '';
            $suppOptName = '[' . $groupN . '] ' . $nameVal;
            $suppPrice = isset($supp['price']) ? $supp['price'] : 0;
            $suppStock = isset($supp['stockQuantity']) ? $supp['stockQuantity'] : 0;
            $usable = !isset($supp['usable']) || $supp['usable'];
            if ($usable && $suppStock > 0) {
                $suppStatus = '판매중';
            } elseif ($suppStock == 0) {
                $suppStatus = '품절';
            } else {
                $suppStatus = '사용불가';
            }
            $suppCode = isset($supp['sellerManagementCode']) ? $supp['sellerManagementCode'] : '';

            $rows[] = array(
                $originNo, '추가옵션', $suppId, $prodName, $suppOptName,
                (string)$suppPrice, '0', (string)$suppStock,
                $suppStatus, $suppCode, $tagsStr, $usable ? 'Y' : 'N'
            );
        }
    }

    // 3. 둘 다 없는 경우 (단일 상품 원상품 행)
    if (count($optionCombinations) === 0 && count($suppProducts) === 0) {
        $rows[] = array(
            $originNo, '원상품', '', $prodName, '',
            (string)$basePrice, '0', (string)$baseStock,
            $baseStatus, $sellerCode, $tagsStr, $baseDisplay
        );
    }

    return $rows;
}

function sb_headers() {
    return array(
        'apikey: ' . SUPABASE_KEY,
        'Authorization: Bearer ' . SUPABASE_KEY,
        'Content-Type: application/json',
        'Prefer: return=minimal',
    );
}

function sb_get_saved_origin_nos() {
    $ids = array();
    $pageSize = 1000;
    $offset = 0;
    while (true) {
        $url = SUPABASE_URL . '/rest/v1/' . SUPABASE_TABLE . '?select=origin_product_no&limit=' . $pageSize . '&offset=' . $offset;
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_HTTPHEADER => sb_headers(),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ));
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($res === false || $code !== 200) {
            throw new Exception('Supabase 조회 실패: ' . $code);
        }
        $data = json_decode($res, true);
        if (!is_array($data) || count($data) === 0) {
            break;
        }
        foreach ($data as $r) {
            if (isset($r['origin_product_no'])) {
                $ids[] = (string)$r['origin_product_no'];
            }
        }
        if (count($data) < $pageSize) {
            break;
        }
        $offset += $pageSize;
    }
    return array_values(array_unique($ids));
}

function row_val($parts, $i) {
    return isset($parts[$i]) ? trim((string)$parts[$i]) : '';
}

function rows_to_db_dicts($rows) {
    $dicts = array();
    foreach ($rows as $parts) {
        while (count($parts) < 12) {
            $parts[] = '';
        }
        $dicts[] = array(
            'origin_product_no' => row_val($parts, 0),
            'category' => row_val($parts, 1),
            'option_id' => row_val($parts, 2),
            'name' => row_val($parts, 3),
            'option_name' => row_val($parts, 4),
            'base_price' => (int)row_val($parts, 5),
            'additional_price' => (int)row_val($parts, 6),
            'stock_quantity' => (int)row_val($parts, 7),
            'status' => row_val($parts, 8),
            'seller_code' => row_val($parts, 9),
            'tags' => row_val($parts, 10),
            'display_status' => row_val($parts, 11),
        );
    }
    return $dicts;
}

function sb_insert_rows($dicts) {
    $url = SUPABASE_URL . '/rest/v1/' . SUPABASE_TABLE;
    $inserted = 0;
    $total = count($dicts);
    for ($i = 0; $i < $total; $i += 500) {
        $batch = array_slice($dicts, $i, 500);
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => sb_headers(),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_POSTFIELDS => json_encode($batch, JSON_UNESCAPED_UNICODE),
        ));
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($res === false || $code >= 300) {
            throw new Exception('Supabase 삽입 실패: ' . $code . ' - ' . $err . ' ' . substr((string)$res, 0, 200));
        }
        $inserted += count($batch);
    }
    return $inserted;
}

function action_test_naver() {
    try {
        $token = get_access_token();

        list($code, $data, $raw) = api_request(
            'POST',
            'https://api.commerce.naver.com/external/v1/products/search',
            $token,
            array('page' => 1, 'size' => 10)
        );
        if ($code !== 200) {
            throw new Exception('상품 조회 실패: ' . $code . ' - ' . $raw);
        }

        $products = isset($data['contents']) ? $data['contents'] : array();
        $sample = null;
        if (count($products) > 0) {
            $p = $products[0];
            $name = isset($p['name']) ? $p['name'] : null;
            if (!$name && isset($p['channelProducts'][0]['name'])) {
                $name = $p['channelProducts'][0]['name'];
            }
            if (!$name && isset($p['originProduct']['name'])) {
                $name = $p['originProduct']['name'];
            }
            $sample = array(
                'originProductNo' => isset($p['originProductNo']) ? $p['originProductNo'] : null,
                'name' => $name,
            );
        }

        json_out(array(
            'success' => true,
            'totalCount' => count($products),
            'sample' => $sample,
        ));
    } catch (Exception $e) {
        json_out(array('success' => false, 'message' => $e->getMessage()), 500);
    }
}

function get_all_product_ids_php($token) {
    $ids = array();
    $page = 1;
    while (true) {
        list($c, $data, $raw) = api_request(
            'POST',
            'https://api.commerce.naver.com/external/v1/products/search',
            $token,
            array('page' => $page, 'size' => 100)
        );
        if ($c !== 200) {
            break;
        }
        $contents = isset($data['contents']) ? $data['contents'] : array();
        if (count($contents) === 0) {
            break;
        }
        foreach ($contents as $p) {
            if (!empty($p['originProductNo'])) {
                $ids[] = (string)$p['originProductNo'];
            }
        }
        $page++;
    }
    return $ids;
}

function fetch_channel_product($token, $originNo) {
    list($code, $data, $raw) = api_request('GET', "https://api.commerce.naver.com/external/v2/products/channel-products/{$originNo}", $token);
    if ($code === 200) {
        return $data;
    }
    return null;
}

function fetch_details_parallel($token, $ids, $concurrency = 10) {
    $all = array();
    $total = count($ids);
    for ($offset = 0; $offset < $total; $offset += $concurrency) {
        $chunk = array_slice($ids, $offset, $concurrency);
        $mh = curl_multi_init();
        $handles = array();
        foreach ($chunk as $pid) {
            $ch = curl_init("https://api.commerce.naver.com/external/v2/products/origin-products/{$pid}");
            curl_setopt_array($ch, array(
                CURLOPT_HTTPHEADER => array('Authorization: Bearer ' . $token),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
            ));
            curl_multi_add_handle($mh, $ch);
            $handles[$pid] = $ch;
        }

        do {
            $mstatus = curl_multi_exec($mh, $active);
            if ($active) {
                curl_multi_select($mh, 0.2);
            }
        } while ($active && $mstatus === CURLM_OK);

        foreach ($handles as $pid => $ch) {
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $res = curl_multi_getcontent($ch);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            if ($httpCode === 200 && $res !== false && $res !== null) {
                $all[$pid] = json_decode($res, true);
            } else {
                // 실패 시 채널 상품 폴백
                $data = fetch_channel_product($token, $pid);
                if ($data !== null) {
                    $all[$pid] = $data;
                }
            }
        }
        curl_multi_close($mh);
    }
    return $all;
}

function sb_delete_all() {
    $url = SUPABASE_URL . '/rest/v1/' . SUPABASE_TABLE . '?id=neq.0';
    $ch = curl_init($url);
    curl_setopt_array($ch, array(
        CURLOPT_CUSTOMREQUEST => 'DELETE',
        CURLOPT_HTTPHEADER => sb_headers(),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
    ));
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res === false || $code >= 300) {
        throw new Exception('Supabase 기존 데이터 삭제 실패: ' . $code);
    }
}

function action_update_stock() {
    try {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input || !isset($input['product']) || !isset($input['newStockQuantity'])) {
            json_out(array('success' => false, 'message' => '필수 파라미터 누락'), 400);
        }

        $token = get_access_token();
        $result = update_naver_stock($token, $input['product'], $input['newStockQuantity']);
        json_out(array('success' => true, 'data' => $result));
    } catch (Exception $e) {
        json_out(array('success' => false, 'message' => $e->getMessage()), 500);
    }
}

function action_sync_new_products() {
    // 동시 실행 방지 (락 파일)
    $lockFile = sys_get_temp_dir() . '/ss_sync_new.lock';
    if (file_exists($lockFile) && (time() - filemtime($lockFile)) < SYNC_LOCK_SECONDS) {
        json_out(array(
            'success' => false,
            'message' => '이미 동기화가 실행 중입니다. 잠시 후 다시 시도하세요.',
        ), 409);
    }
    touch($lockFile);

    $response = null;
    $code = 200;
    try {
        set_time_limit(0);

        $token = get_access_token();

        // [1단계] 스토어 전체 상품번호 조회
        $apiIds = get_all_product_ids_php($token);

        // [2단계] Supabase 저장된 원상품코드와 비교하여 신규만 추출
        $savedIds = sb_get_saved_origin_nos();
        $savedSet = array_flip($savedIds);

        $newIds = array();
        $savedCount = 0;
        foreach ($apiIds as $id) {
            if (isset($savedSet[$id])) {
                $savedCount++;
            } else {
                $newIds[] = $id;
            }
        }
        $summary = '스토어 전체: ' . count($apiIds) . '개 | Supabase 저장됨: ' . $savedCount . '개 | 신규: ' . count($newIds) . '개';

        if (count($newIds) === 0) {
            $response = array(
                'success' => true,
                'message' => $summary . "\n" . '새로 추가된 상품이 없습니다.',
            );
        } else {
            // [3단계] 신규 상품 상세 수집 후 Supabase 삽입
            $dbRows = array();
            $failIds = array();
            $idx = 0;
            foreach ($newIds as $pid) {
                $idx++;
                $detail = fetch_product_detail($token, $pid);
                if ($detail === null) {
                    $failIds[] = $pid;
                    continue;
                }
                $rows = parse_product_rows($pid, $detail);
                foreach ($rows as $r) {
                    $dbRows[] = $r;
                }
            }

            $inserted = count($dbRows) > 0 ? sb_insert_rows(rows_to_db_dicts($dbRows)) : 0;

            $msg = $summary . "\n"
                 . '완료! 신규 ' . (count($newIds) - count($failIds)) . '개 상품에서 ' . count($dbRows) . '행 처리되었습니다.'
                 . ' (Supabase ' . $inserted . '행 삽입)';
            if (count($failIds) > 0) {
                $msg .= "\n" . '조회 실패: ' . implode(', ', $failIds);
            }
            $response = array(
                'success' => true,
                'message' => $msg,
            );
        }
    } catch (Exception $e) {
        $response = array('success' => false, 'message' => $e->getMessage());
        $code = 500;
    }
    @unlink($lockFile);
    json_out($response, $code);
}

function action_sync_all() {
    // 동시 실행 방지 (sync-new 와 같은 락 공유)
    $lockFile = sys_get_temp_dir() . '/ss_sync_new.lock';
    if (file_exists($lockFile) && (time() - filemtime($lockFile)) < SYNC_LOCK_SECONDS) {
        json_out(array(
            'success' => false,
            'message' => '이미 동기화가 실행 중입니다. 잠시 후 다시 시도하세요.',
        ), 409);
    }
    touch($lockFile);

    $response = null;
    $code = 200;
    try {
        set_time_limit(0);
        $start = round(microtime(true) * 1000);

        $token = get_access_token();

        // [1단계] 스토어 전체 상품번호 조회
        $apiIds = get_all_product_ids_php($token);

        // [2단계] 전체 상품 상세 정보 병렬 수집 (기존 상품 포함 - 네이버 기준으로 갱신)
        $details = fetch_details_parallel($token, $apiIds, DETAIL_CONCURRENCY);

        // [3단계] 파싱
        $dbRows = array();
        $failIds = array();
        foreach ($apiIds as $pid) {
            if (isset($details[$pid])) {
                foreach (parse_product_rows($pid, $details[$pid]) as $r) {
                    $dbRows[] = $r;
                }
            } else {
                $failIds[] = $pid;
            }
        }

        // [4단계] Supabase 전체 교체 (기존 데이터 삭제 후 재삽입)
        sb_delete_all();
        $inserted = count($dbRows) > 0 ? sb_insert_rows(rows_to_db_dicts($dbRows)) : 0;

        $elapsed = (int)((round(microtime(true) * 1000) - $start) / 1000);
        $msg = '스토어 전체: ' . count($apiIds) . '개 상품 | ' . count($dbRows) . '행 처리 (Supabase ' . $inserted . '행 삽입, ' . $elapsed . '초 소요)';
        if (count($failIds) > 0) {
            $msg .= "\n" . '조회 실패: ' . implode(', ', $failIds);
        }
        $response = array('success' => true, 'message' => $msg);
    } catch (Exception $e) {
        $response = array('success' => false, 'message' => $e->getMessage());
        $code = 500;
    }
    @unlink($lockFile);
    json_out($response, $code);
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
switch ($action) {
    case 'test-naver':
        action_test_naver();
        break;
    case 'update-stock':
        action_update_stock();
        break;
    case 'sync-new-products':
        action_sync_new_products();
        break;
    case 'sync-all':
        action_sync_all();
        break;
    case 'my-ip':
        $ip = get_outbound_ip();
        if ($ip === null) {
            json_out(array('success' => false, 'message' => 'IP 확인 실패'), 500);
        }
        json_out(array('success' => true, 'ip' => $ip));
        break;
    case 'health':
        json_out(array(
            'status' => 'ok',
            'server_time' => date('Y-m-d H:i:s'),
            'server_time_ms' => sprintf('%.0f', round(microtime(true) * 1000)),
            'php_int_size' => PHP_INT_SIZE,
            'outbound_ip' => get_outbound_ip(),
        ));
        break;
    default:
        json_out(array(
            'success' => false,
            'message' => 'action 파라미터 필요 (test-naver, update-stock, sync-new-products, my-ip, health)',
        ), 400);
}
