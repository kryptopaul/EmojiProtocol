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

interface IL1StandardBridge {
    function depositERC20To(
        address _l1Token,
        address _l2Token,
        address _to,
        uint256 _amount,
        uint32 _minGasLimit,
        bytes calldata _extraData
    ) external;
}

error NotEthereum();
error NotBase();
error NoMoney();
error Unauthorized();
error NotOnEthereum();
error InsufficientMogBalance();

contract EmojiProtocol is Ownable {
    ICrossDomainMessenger public MESSENGER;
    IL1StandardBridge public L1_BRIDGE;
    uint32 public bridgeGasLimit = 2000000;

    ISwapRouter public swapRouter;
    IERC20 public MOG_COIN;
    IERC20 public L2_MOG_COIN;
    IWETH public WETH;

    constructor() {
        _initializeOwner(0x644C1564d1d19Cf336417734170F21B944109074);
        MESSENGER = ICrossDomainMessenger(0x866E82a600A1414e583f7F13623F1aC5d58b0Afa);
        L1_BRIDGE = IL1StandardBridge(0x3154Cf16ccdb4C6d922629664174b904d80F2C35); // Base L1 Bridge address
    }

    function initialize(
        address _swapRouter,
        address _mogCoin,
        address _l2MogCoin,
        address _weth
    ) external onlyOwner {
        swapRouter = ISwapRouter(_swapRouter);
        MOG_COIN = IERC20(_mogCoin);
        L2_MOG_COIN = IERC20(_l2MogCoin);
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

   function bridgeMogToBase(uint256 _amount) external {
        if (block.chainid != 1) {
            revert NotOnEthereum();
        }
        
        if (MOG_COIN.balanceOf(msg.sender) < _amount) {
            revert InsufficientMogBalance();
        }
        
        MOG_COIN.transferFrom(msg.sender, address(this), _amount);
        MOG_COIN.approve(address(L1_BRIDGE), _amount);
        
        L1_BRIDGE.depositERC20To(
            address(MOG_COIN),
            address(L2_MOG_COIN),
            address(this), 
            _amount,
            bridgeGasLimit,
            ""
        );
    }
    
    receive() external payable {
        if (block.chainid == 1) {
            bridgeAndSwapFromEthereum();
        } else if (block.chainid == 8453) {
            _wrapAndSwap(address(this), msg.value);
        }
    }
}