import { expect, test } from 'claude-code/testing'
import { equalsConstantTime, hmacHex, hmacSha256, sha256, toHex, utf8 } from './sha256'

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map(b => parseInt(b, 16)))
const bytes = (n: number, v: number) => new Uint8Array(n).fill(v)

test('SHA-256 matches the NIST vectors', () => {
  expect(toHex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  expect(toHex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  expect(toHex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  )
  // Crosses several blocks (cross-checked with node:crypto).
  expect(toHex(sha256(utf8('a'.repeat(1000))))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3')
})

test('HMAC-SHA256 matches RFC 4231 test cases 1-4, 6, 7', () => {
  const mac = (k: Uint8Array, m: Uint8Array) => toHex(hmacSha256(k, m))
  expect(mac(bytes(20, 0x0b), utf8('Hi There'))).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')
  expect(mac(utf8('Jefe'), utf8('what do ya want for nothing?'))).toBe(
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  )
  expect(mac(bytes(20, 0xaa), bytes(50, 0xdd))).toBe('773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe')
  expect(mac(hex('0102030405060708090a0b0c0d0e0f10111213141516171819'), bytes(50, 0xcd))).toBe(
    '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
  )
  expect(mac(bytes(131, 0xaa), utf8('Test Using Larger Than Block-Size Key - Hash Key First'))).toBe(
    '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
  )
  expect(
    mac(
      bytes(131, 0xaa),
      utf8(
        'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.',
      ),
    ),
  ).toBe('9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2')
})

test('hmacHex is what the overlay sends for a token and nonce', () => {
  expect(hmacHex('tok-123', '00ff')).toBe('2b4c56e17354a466e063881f026812b1a2ba92f51995d567342d31ac55b3269b')
})

test('the constant-time compare tells equal from different', () => {
  expect(equalsConstantTime('abc', 'abc')).toBe(true)
  expect(equalsConstantTime('abc', 'abd')).toBe(false)
  expect(equalsConstantTime('abc', 'ab')).toBe(false)
})
