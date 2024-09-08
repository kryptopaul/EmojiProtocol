// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "../lib/solady/src/auth/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FixedPointMathLib as FPML} from "../lib/solady/src/utils/FixedPointMathLib.sol";

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}

interface ICrossDomainMessenger {
    function xDomainMessageSender() external view returns (address);
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external payable;
}

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
    function approve(address, uint256) external returns (bool);
}

error NotEthereum();
error NotBase();
error NoMoney();
error Unauthorized();

contract EmojiProtocol is Ownable {
    ICrossDomainMessenger MESSENGER;
    uint32 public bridgeGasLimit = 2000000;

    ISwapRouter public swapRouter;
    IERC20 public MOG_COIN;
    IWETH public WETH;

    constructor() {
        _initializeOwner(0x644C1564d1d19Cf336417734170F21B944109074);
        MESSENGER = ICrossDomainMessenger(0x866E82a600A1414e583f7F13623F1aC5d58b0Afa);
    }

    function initialize(address _swapRouter, address _mogCoin, address _weth) external onlyOwner{
        swapRouter = ISwapRouter(_swapRouter);
        MOG_COIN = IERC20(_mogCoin);
        WETH = IWETH(_weth);
    }
    
    function setBridgeGasLimit(uint32 _newGasLimit) external onlyOwner {
        bridgeGasLimit = _newGasLimit;
    }

    function bridgeAndSwapFromEthereum() public payable {
        if (block.chainid != 1) revert NotEthereum();
        MESSENGER.sendMessage{value: msg.value}(
            address(this),
            abi.encodeCall(this.bridgeAndSwapOnBase, (address(this))),
            bridgeGasLimit
        );
    }

    function bridgeAndSwapOnBase(address recipient) external payable {
        uint256 amountIn = address(this).balance;
        if (amountIn == 0) revert NoMoney();

        _wrapAndSwap(recipient, amountIn);
    }

    function _wrapAndSwap(address recipient, uint256 amountIn) internal {
        WETH.deposit{value: amountIn}();

        WETH.approve(address(swapRouter), amountIn);

        // Perform the swap
        swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(WETH),
                tokenOut: address(MOG_COIN),
                fee: 3000,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function hugoWin(address recipient, uint16 feePercentage) external onlyOwner {
        uint256 balance = MOG_COIN.balanceOf(address(this));
        uint256 feeAmount = FPML.fullMulDiv(balance, feePercentage, 10000);
        uint256 recipientAmount = balance - feeAmount;
        
        MOG_COIN.transfer(recipient, recipientAmount);
        MOG_COIN.transfer(owner(), feeAmount);
    }

    receive() external payable {
        if (block.chainid == 1) {
            bridgeAndSwapFromEthereum();
        } else if (block.chainid == 8453) {
            _wrapAndSwap(address(this), msg.value);
        }
    }
}