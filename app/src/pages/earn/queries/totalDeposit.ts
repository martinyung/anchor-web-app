import { useQuerySubscription } from '@anchor-protocol/use-broadcastable-query';
import { useWallet } from '@anchor-protocol/wallet-provider';
import { gql, QueryResult, useQuery } from '@apollo/client';
import big from 'big.js';
import { useAddressProvider } from 'contexts/contract';
import { useMemo } from 'react';

export interface StringifiedData {
  aUSTBalance: {
    Result: string;
  };
  exchangeRate: {
    Result: string;
  };
}

export interface Data {
  aUSTBalance: {
    balance: string;
  };
  exchangeRate: {
    a_token_supply: string;
    exchange_rate: string;
  };
  totalDeposit: string;
}

export function parseData({
  aUSTBalance,
  exchangeRate,
}: StringifiedData): Data {
  const parsedAUSTBalance: Data['aUSTBalance'] = JSON.parse(aUSTBalance.Result);
  const parsedExchangeRate: Data['exchangeRate'] = JSON.parse(
    exchangeRate.Result,
  );
  return {
    aUSTBalance: parsedAUSTBalance,
    exchangeRate: parsedExchangeRate,
    totalDeposit: big(parsedAUSTBalance.balance)
      .mul(parsedExchangeRate.exchange_rate)
      .toString(),
  };
}

export interface StringifiedVariables {
  anchorTokenContract: string;
  anchorTokenBalanceQuery: string;
  moneyMarketContract: string;
  moneyMarketEpochQuery: string;
}

export interface Variables {
  anchorTokenContract: string;
  anchorTokenBalanceQuery: {
    balance: {
      address: string;
    };
  };
  moneyMarketContract: string;
  moneyMarketEpochQuery: {
    epoch_state: {};
  };
}

export function stringifyVariables({
  anchorTokenContract,
  anchorTokenBalanceQuery,
  moneyMarketContract,
  moneyMarketEpochQuery,
}: Variables): StringifiedVariables {
  return {
    anchorTokenContract,
    anchorTokenBalanceQuery: JSON.stringify(anchorTokenBalanceQuery),
    moneyMarketContract,
    moneyMarketEpochQuery: JSON.stringify(moneyMarketEpochQuery),
  };
}

export const query = gql`
  query earnTotalDeposit(
    $anchorTokenContract: String!
    $anchorTokenBalanceQuery: String!
    $moneyMarketContract: String!
    $moneyMarketEpochQuery: String!
  ) {
    aUSTBalance: WasmContractsContractAddressStore(
      ContractAddress: $anchorTokenContract
      QueryMsg: $anchorTokenBalanceQuery
    ) {
      Result
    }

    exchangeRate: WasmContractsContractAddressStore(
      ContractAddress: $moneyMarketContract
      QueryMsg: $moneyMarketEpochQuery
    ) {
      Result
    }
  }
`;

export function useTotalDeposit(): QueryResult<
  StringifiedData,
  StringifiedVariables
> & { parsedData: Data | undefined } {
  const addressProvider = useAddressProvider();
  const { status } = useWallet();

  const result = useQuery<StringifiedData, StringifiedVariables>(query, {
    skip: status.status !== 'ready',
    variables: stringifyVariables({
      anchorTokenContract: addressProvider.aToken(''),
      anchorTokenBalanceQuery: {
        balance: {
          address: status.status === 'ready' ? status.walletAddress : '',
        },
      },
      moneyMarketContract: addressProvider.market(''),
      moneyMarketEpochQuery: {
        epoch_state: {},
      },
    }),
  });

  useQuerySubscription(
    (id, event) => {
      if (event === 'done') {
        result.refetch();
      }
    },
    [result.refetch],
  );

  const parsedData = useMemo(
    () => (result.data ? parseData(result.data) : undefined),
    [result.data],
  );

  return {
    ...result,
    parsedData,
  };
}
