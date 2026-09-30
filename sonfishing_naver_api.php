<?php
/**
 * 네이버 스마트스토어 릴레이 API (PHP 7)
 * naver_relay_server.py 를 PHP 로 포팅한 버전
 *
 * 엔드포인트:
 *   GET  ?action=health
 *   GET  ?action=test-naver
 *   POST ?action=update-stock          body: {"product": {...}, "newStockQuantity": 10}
 *   POST ?action=sync-new-products
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

// 신규 상품 동기화 스크립트(ss_sync_new.py) 경로 - 이 PHP 가 실행되는 PC 기준
// (다른 서버에 올릴 경우 sync-new-products 는 동작하지 않고 update-stock/test-naver 만 동작)
define('SYNC_SCRIPT_PATH', 'C:\code\zzii_ss\ss_sync_new.py');
define('SYNC_WORK_DIR', 'C:\code\zzii_ss');
define('SYNC_LOCK_SECONDS', 600);

function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
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

    if (!file_exists(SYNC_SCRIPT_PATH)) {
        json_out(array(
            'success' => false,
            'message' => 'sync 스크립트를 찾을 수 없습니다: ' . SYNC_SCRIPT_PATH,
        ), 500);
    }

    touch($lockFile);
    $response = null;
    $code = 200;
    try {
        set_time_limit(0);
        // ss_sync_new.py 실행 (stdout+stderr 병합)
        $cmd = 'cd /d ' . escapeshellarg(SYNC_WORK_DIR)
             . ' && python -X utf8 ' . escapeshellarg(SYNC_SCRIPT_PATH) . ' 2>&1';
        $outputLines = array();
        $returnCode = 0;
        exec($cmd, $outputLines, $returnCode);
        $output = implode("\n", $outputLines);

        $response = array(
            'success' => $returnCode === 0,
            'returncode' => $returnCode,
            'output' => substr($output, -4000),
            'message' => $returnCode === 0 ? '완료' : '스크립트 실행 오류',
        );
        if ($returnCode !== 0) {
            $code = 500;
        }
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
    case 'health':
        json_out(array(
            'status' => 'ok',
            'server_time' => date('Y-m-d H:i:s'),
            'server_time_ms' => sprintf('%.0f', round(microtime(true) * 1000)),
            'php_int_size' => PHP_INT_SIZE,
        ));
        break;
    default:
        json_out(array(
            'success' => false,
            'message' => 'action 파라미터 필요 (test-naver, update-stock, sync-new-products, health)',
        ), 400);
}
