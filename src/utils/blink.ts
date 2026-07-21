import { gql, GraphQLClient } from "graphql-request";
import { PaymentProvider } from "../types";

type BlinkCallbackQueryResponse = {
  me: { defaultAccount: { callbackEndpoints: { url: string }[] } };
};

export type BlinkInvoiceResponse = {
  lnInvoiceCreateOnBehalfOfRecipient: {
    invoice: {
      paymentRequest: string;
      paymentHash: string;
      paymentSecret: string;
      satoshis: number;
    };
  };
};

export type BlinkPaymentResponse = {
  lnInvoicePaymentSend: {
    status: string;
    transaction: {
      settlementVia: {
        preimage: string;
      };
    };
  };
};

export type BlinkStatusReponse = {
  lnInvoicePaymentStatus: {
    status: "PAID" | "PENDING" | "EXPIRED";
    errors?: {
      message: string;
    };
  };
};

const endpoint = `${process.env.BLINK_URL!}`;

const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    "X-API-KEY": process.env.BLINK_API_KEY || "",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; npubcash-server/1.0)",
  },
});

export class BlinkProvider implements PaymentProvider {
  async createInvoice(amount: number, memo?: string, descriptionHash?: string) {
    const invoice = await createBlinkInvoice(
      amount,
      memo ? memo : "",
      descriptionHash,
    );
    return {
      paymentRequest: invoice.paymentRequest,
      paymentHash: invoice.paymentHash,
      paymentSecret: invoice.paymentSecret,
    };
  }
  async payInvoice(invoice: string) {
    return sendPayment(invoice);
  }
  async checkPayment(invoice: string) {
    return checkPaymentStatus(invoice);
  }
}

export async function sendPayment(
  invoice: string,
): Promise<{ paid: false } | { paid: true; preimage: string }> {
  const mutation = gql`
    mutation lnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
      lnInvoicePaymentSend(input: $input) {
        status
        transaction {
          settlementVia {
            ... on SettlementViaIntraLedger {
              preImage
            }
            ... on SettlementViaLn {
              preImage
            }
          }
        }
        errors {
          message
          path
          code
        }
      }
    }
  `;
  const variables = {
    input: {
      walletId: process.env.BLINK_WALLET_ID,
      paymentRequest: invoice,
    },
  };
  const data = (await graphQLClient.request(
    mutation,
    variables,
  )) as BlinkPaymentResponse;
  if (data.lnInvoicePaymentSend.status !== "SUCCESS") {
    return { paid: false };
  }
  return {
    paid: true,
    preimage: data.lnInvoicePaymentSend.transaction.settlementVia.preimage,
  };
}

export async function createBlinkInvoice(
  amountInSats: number,
  memo: string,
  descriptionHash?: string,
) {
  const mutation = gql`
    mutation lnInvoiceCreate($input: LnInvoiceCreateInput!) {
      lnInvoiceCreate(input: $input) {
        invoice {
          paymentRequest
          paymentHash
          paymentSecret
          satoshis
        }
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      amount: amountInSats,
      memo,
      walletId: process.env.BLINK_WALLET_ID,
    },
  };

  const data = (await graphQLClient.request(
    mutation,
    variables,
  )) as {
    lnInvoiceCreate: {
      invoice?: {
        paymentRequest: string;
        paymentHash: string;
        paymentSecret: string;
        satoshis: number;
      };
      errors?: { message: string }[];
    };
  };

  if (!data.lnInvoiceCreate.invoice) {
    console.log(data.lnInvoiceCreate.errors);
    throw new Error(data.lnInvoiceCreate.errors?.[0]?.message || "Failed to retrieve invoice");
  }
  return data.lnInvoiceCreate.invoice;
}

export async function checkPaymentStatus(paymentRequest: string) {
  const query = gql`
    query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
      lnInvoicePaymentStatus(input: $input) {
        status
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      paymentRequest: paymentRequest,
    },
  };

  const data = (await graphQLClient.request(
    query,
    variables,
  )) as BlinkStatusReponse;
  if (data.lnInvoicePaymentStatus.errors?.message) {
    return { paid: false };
  }
  return { paid: data.lnInvoicePaymentStatus.status === "PAID" };
}

export async function registerCallback(endpoint: string) {
  const query = gql`
    mutation CallbackEndpointAdd($input: CallbackEndpointAddInput!) {
      callbackEndpointAdd(input: $input) {
        errors {
          code
          message
        }
        id
      }
    }
  `;

  const variables = {
    input: {
      url: endpoint,
    },
  };

  const data = (await graphQLClient.request(query, variables)) as {
    callbackEndpointAdd: {
      errors?: { code: string; message: string };
      id: string;
    };
  };
  if (data.callbackEndpointAdd.errors?.message) {
    throw new Error(data.callbackEndpointAdd.errors.message);
  }
  return data.callbackEndpointAdd.id;
}

export async function getCallbackEndpoints() {
  const query = gql`
    query CallbackEndpoints {
      me {
        defaultAccount {
          callbackEndpoints {
            url
          }
        }
      }
    }
  `;

  const data = (await graphQLClient.request(
    query,
  )) as BlinkCallbackQueryResponse;
  return data.me.defaultAccount.callbackEndpoints.map((cb) => cb.url);
}

export function isCallbackSetup(res: string[], endpoint: string) {
  for (let i = 0; i < res.length; i++) {
    if (res[i] === endpoint) {
      return true;
    }
  }
  return false;
}

export async function setupCallbacks() {
  console.log("Setting up callback: ", process.env.HOSTNAME);
  const res = await getCallbackEndpoints();
  console.log(res);
  const isSetup = isCallbackSetup(res, `${process.env.HOSTNAME}/api/v1/paid`);
  console.log(isSetup);
  if (!isSetup) {
    console.log("Registering callback with blink...");
    const cbRes = await registerCallback(`${process.env.HOSTNAME}/api/v1/paid`);
    console.log(cbRes);
  }
}
